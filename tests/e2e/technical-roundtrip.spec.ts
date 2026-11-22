import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  ArticleDocument,
  ArticleListItem,
  ArticleSnapshot,
  AuthSession,
  RevisionDetail,
  type DocumentNode,
} from '@inkling/contracts';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openFixtureStorage } from '../fixtures/storage';
import { openRevisionMenu } from './revision-menu';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4VSEHAAQAAZHUcVaRAAAAAElFTkSuQmCC',
  'base64',
);
const imageName = createHash('sha256').update(png).digest('hex') + '.png';
const original = {
  value: '四十',
  align: 'right',
  formula: '\\frac{1}{2}\n  + x^2',
  diagram: 'flowchart LR\n  A[采样] --> B[汇总]',
  width: 60,
};
const revised = {
  value: '八十',
  align: 'center',
  formula: '\\frac{3}{4}\n  + y^2',
  diagram: 'flowchart TD\n  A[对照] --> B[复核]',
  width: 96,
};
function manuscript(v: typeof original): ArticleDocument {
  const text = (s: string): DocumentNode => ({ type: 'text', text: s });
  const row = (label: string, value: string) => ({
    type: 'md:table.row',
    content: [
      {
        type: 'md:table.cell',
        attrs: { align: 'left' },
        content: [text(label)],
      },
      {
        type: 'md:table.cell',
        attrs: { align: v.align },
        content: [text(value)],
      },
    ],
  });
  return {
    schemaVersion: 2,
    title: '采样实验',
    doc: {
      type: 'doc',
      content: [
        {
          type: 'md:table',
          content: [row('分组', '结果'), row('样本 `A`', v.value)],
        },
        { type: 'formulaBlock', content: [text(v.formula)] },
        { type: 'mermaidBlock', content: [text(v.diagram)] },
        {
          type: 'md:paragraph',
          content: [
            text(
              '<img src="inkling-image:' +
                imageName +
                '" alt="采样图" title="图一" width="' +
                v.width +
                '">',
            ),
          ],
        },
      ],
    },
  };
}
async function prepare(page: Page, origin: string) {
  const session = AuthSession.parse(
    await (await page.request.get('/api/auth/session')).json(),
  );
  const headers = { origin, 'x-csrf-token': session.csrfToken };
  const image = await page.request.post('/api/images', {
    headers: { ...headers, 'content-type': 'application/octet-stream' },
    data: png,
  });
  expect(image.status()).toBe(201);
  expect(await image.json()).toMatchObject({ name: imageName });
  const response = await page.request.post('/api/articles', {
    headers,
    data: { mutationId: crypto.randomUUID(), document: manuscript(original) },
  });
  expect(response.ok()).toBe(true);
  const first = ArticleSnapshot.parse(await response.json());
  const path = '/api/articles/' + first.articleId;
  const head = async () =>
    ArticleSnapshot.parse(await (await page.request.get(path)).json());
  const revision = async (id: string) =>
    RevisionDetail.parse(
      await (await page.request.get(path + '/revisions/' + id)).json(),
    );
  await page.reload();
  await expect(page.getByLabel('文章标题', { exact: true })).toHaveValue(
    '采样实验',
  );
  return { first, headers, path, head, revision };
}
const paper = (page: Page) =>
  page.getByRole('textbox', { name: '文章正文', exact: true });
async function expectPaper(page: Page, v: typeof original) {
  const body = paper(page);
  await expect(body.getByRole('columnheader').last()).toHaveText('结果');
  await expect(body.getByRole('cell').last()).toHaveText(v.value);
  await expect(body.getByRole('cell').last()).toHaveCSS('text-align', v.align);
  await expect(body.locator('math mfrac')).toBeVisible();
  await expect
    .poll(() => body.locator('math annotation').textContent())
    .toBe(v.formula);
  const diagram = body.getByRole('img', { name: '流程图预览' });
  await expect(diagram).toBeVisible();
  await expect
    .poll(() =>
      diagram.evaluate((el: HTMLImageElement) => {
        if (!el.naturalWidth) return [];
        const svg = new DOMParser().parseFromString(
          decodeURIComponent(el.src.split(',')[1]!),
          'image/svg+xml',
        );
        return Array.from(svg.querySelectorAll('g.node'), (node) =>
          node.textContent?.trim(),
        ).sort();
      }),
    )
    .toEqual(
      v.diagram === original.diagram ? ['汇总', '采样'] : ['复核', '对照'],
    );
  await expect
    .poll(() =>
      body.locator('.mu-diagram-block .mu-codeblock-content').textContent(),
    )
    .toBe(v.diagram);
  const photo = body.getByRole('img', { name: '采样图' });
  await expect(photo).toHaveAttribute('title', '图一');
  await expect(photo).toHaveAttribute('width', String(v.width));
  await expect(photo).toHaveAttribute(
    'src',
    new RegExp('/api/images/' + imageName + '$'),
  );
  await expect
    .poll(() => photo.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBe(1);
}
async function editSource(page: Page, label: string, value: string) {
  const block = paper(page).getByRole('group', { name: label, exact: true });
  const source = block.getByRole('textbox', { name: label + '源码' });
  if (!(await source.isVisible())) await block.locator('summary').click();
  await source.fill(value);
}
async function downloadDraft(page: Page, button: Locator) {
  const downloading = page.waitForEvent('download');
  await button.click();
  const path = await (await downloading).path();
  if (!path) throw new Error('缺少草稿备份');
  return JSON.parse(await readFile(path, 'utf8'));
}
test('EDITOR-ROUNDTRIP-010 混排稿两份修订可命名、比较并恢复，归档后保留格式与指纹', async ({
  page,
  workspace,
}) => {
  const { first, headers, path, head, revision } = await prepare(
    page,
    workspace.origin,
  );
  await expectPaper(page, original);
  await page.getByRole('button', { name: '文章菜单' }).click();
  await page.getByRole('button', { name: '版本历史', exact: true }).click();
  const panel = page.getByRole('region', { name: '版本历史' });
  await openRevisionMenu(panel, 1);
  await panel.getByRole('button', { name: '命名版本 #1' }).click();
  await page.getByLabel('稿次名称').fill('首轮采样');
  await page.getByRole('button', { name: '保存名称' }).click();
  await expect(panel.getByText('首轮采样', { exact: true })).toBeVisible();
  const source = await revision(first.headRevisionId);
  expect(source).toMatchObject({
    name: '首轮采样',
    document: manuscript(original),
    contentHash: first.contentHash,
  });
  const write = await page.request.put(path + '/content', {
    headers,
    data: {
      mutationId: crypto.randomUUID(),
      baseRevisionId: first.headRevisionId,
      document: manuscript(revised),
    },
  });
  expect(write.ok()).toBe(true);
  const second = await head();
  expect(second.contentHash).not.toBe(first.contentHash);
  await page.reload();
  await expectPaper(page, revised);
  await page.getByRole('button', { name: '文章菜单' }).click();
  await page.getByRole('button', { name: '版本历史', exact: true }).click();
  await panel
    .getByRole('listitem')
    .filter({ hasText: '首轮采样' })
    .getByRole('button', { name: '比较' })
    .click();
  await panel.getByLabel('比较目标版本').selectOption(second.headRevisionId);
  const diff = panel.getByRole('region', { name: '版本差异' });
  await expect(diff.locator('.revision-change')).toHaveCount(4);
  for (const [i, before, after] of [
    [0, '四十', '八十'],
    [1, original.formula, revised.formula],
    [2, original.diagram, revised.diagram],
    [3, '60', '96'],
  ] as const) {
    await expect(
      diff.locator('.revision-change').nth(i).locator('.removed'),
    ).toContainText(before);
    await expect(
      diff.locator('.revision-change').nth(i).locator('.added'),
    ).toContainText(after);
  }
  await expect(diff.locator('.revision-change').first()).toContainText(
    '格式或结构变化',
  );
  expect((await head()).headRevisionId).toBe(second.headRevisionId);
  await panel.getByRole('button', { name: '结束比较' }).click();
  await openRevisionMenu(panel, 1);
  await panel.getByRole('button', { name: '查看并恢复版本 #1' }).click();
  await panel.getByRole('button', { name: '恢复为新版本' }).click();
  await expectPaper(page, original);
  const restored = await head();
  expect(restored).toMatchObject({
    headSeq: second.headSeq + 1,
    document: manuscript(original),
    contentHash: first.contentHash,
  });
  expect(await revision(restored.headRevisionId)).toMatchObject({
    parentRevisionId: second.headRevisionId,
    restoredFromRevisionId: first.headRevisionId,
  });
  expect(await revision(first.headRevisionId)).toEqual({
    ...source,
    current: false,
  });
  expect(await revision(second.headRevisionId)).toMatchObject({
    document: manuscript(revised),
    contentHash: second.contentHash,
    current: false,
  });
  const unsupported = await page.request.put(path + '/content', {
    headers,
    data: {
      mutationId: crypto.randomUUID(),
      baseRevisionId: restored.headRevisionId,
      document: {
        ...restored.document,
        doc: {
          type: 'doc',
          content: [
            ...restored.document.doc.content!,
            { type: 'md:unknown-figure' },
          ],
        },
      },
    },
  });
  expect(unsupported.status()).toBe(422);
  const metadata = ArticleListItem.parse(
    await (await page.request.get(path + '/metadata')).json(),
  );
  expect(
    (
      await page.request.post(path + '/lifecycle', {
        headers,
        data: {
          mutationId: crypto.randomUUID(),
          baseMetadataVersion: metadata.metadataVersion,
          action: 'archive',
        },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post(path + '/open', {
        headers,
        data: { mutationId: crypto.randomUUID() },
      })
    ).ok(),
  ).toBe(true);
  await page.goto('about:blank');
  await workspace.stop();
  const db = openFixtureStorage(workspace.dir, true);
  try {
    const rows = db
      .prepare<[string], { bytes: Buffer; content_hash: string }>(
        'SELECT CAST(document_json AS BLOB) AS bytes, content_hash FROM article_revisions WHERE article_id=? ORDER BY seq',
      )
      .all(first.articleId);
    expect(rows.map((r) => r.content_hash)).toEqual([
      first.contentHash,
      second.contentHash,
      restored.contentHash,
    ]);
    for (const row of rows)
      expect(createHash('sha256').update(row.bytes).digest('hex')).toBe(
        row.content_hash,
      );
    expect(rows[2]!.bytes).toEqual(rows[0]!.bytes);
  } finally {
    db.close();
  }
  await page.goto(await workspace.restart());
  await expect(paper(page)).toHaveAttribute('contenteditable', 'false');
  await expect(page.getByText('文章已归档，当前为只读。')).toBeVisible();
  await expectPaper(page, original);
  expect(await head()).toEqual(restored);
  expect(
    await (await page.request.get('/api/images/' + imageName)).body(),
  ).toEqual(png);
});
for (const concurrent of [false, true]) {
  test(
    'EDITOR-ROUNDTRIP-010 离线混排稿下载救援与恢复' +
      (concurrent ? '时逐份比较再确认并发合并' : '后完整重开'),
    async ({ page, workspace, context }) => {
      const { first, head, revision } = await prepare(page, workspace.origin);
      const local = { ...original, formula: revised.formula };
      const remote = { ...original, diagram: revised.diagram };
      page.on('dialog', (d) => d.accept());
      const other = concurrent ? await context.newPage() : null;
      if (other) {
        await other.goto(workspace.origin);
        await expectPaper(other, original);
      }
      await page.route('**/api/articles/*/content', (route) =>
        route.abort('failed'),
      );
      await editSource(page, '公式', local.formula);
      await expect(
        page.getByRole('button', { name: '重试保存' }),
      ).toBeVisible();
      await expect(
        page.getByText('浏览器恢复副本已更新', { exact: true }),
      ).toBeVisible();
      const rescue = await downloadDraft(
        page,
        page.getByRole('button', { name: '下载备份' }),
      );
      expect(rescue.ack).toMatchObject({
        headRevisionId: first.headRevisionId,
        document: manuscript(original),
      });
      expect(rescue.draft.document).toEqual(manuscript(local));
      expect((await head()).headRevisionId).toBe(first.headRevisionId);
      if (other) {
        await editSource(other, '流程图', remote.diagram);
        await expect(other.getByText('已保存', { exact: true })).toBeVisible();
        await expect
          .poll(async () => (await head()).document)
          .toEqual(manuscript(remote));
        await other.close();
      }
      const server = await head();
      await page.unroute('**/api/articles/*/content');
      await page.reload();
      await expectPaper(page, concurrent ? remote : original);
      const recovery = page.getByRole('region', { name: '待恢复草稿' });
      expect(
        (
          await downloadDraft(
            page,
            recovery.getByRole('button', { name: '下载此副本' }),
          )
        ).draft.document,
      ).toEqual(manuscript(local));
      await recovery.getByRole('button', { name: '恢复此草稿' }).click();
      if (concurrent) {
        await page.getByRole('button', { name: '查看冲突' }).click();
        for (const [side, expected] of [
          ['本页草稿预览', local],
          ['服务器版本预览', remote],
        ] as const) {
          const view = page.getByRole('region', { name: side });
          await expect(view.getByRole('columnheader').last()).toHaveText(
            '结果',
          );
          await expect(view.getByRole('cell').last()).toHaveCSS(
            'text-align',
            expected.align,
          );
          expect(await view.getByLabel('公式源码').textContent()).toBe(
            expected.formula,
          );
          expect(await view.getByLabel('流程图源码').textContent()).toBe(
            expected.diagram,
          );
          await expect(
            view.getByRole('img', { name: '采样图' }),
          ).toHaveAttribute('width', String(expected.width));
        }
        expect((await head()).headRevisionId).toBe(server.headRevisionId);
        await editSource(page, '流程图', remote.diagram);
        await page.getByRole('button', { name: '准备保存合并稿' }).click();
        expect((await head()).headRevisionId).toBe(server.headRevisionId);
        await page.getByRole('button', { name: '确认保存合并稿' }).click();
      }
      await expect(page.getByText('已保存', { exact: true })).toBeVisible();
      const final = concurrent ? { ...local, diagram: remote.diagram } : local;
      await expect
        .poll(async () => (await head()).document)
        .toEqual(manuscript(final));
      const saved = await head();
      expect(saved.document).toEqual(manuscript(final));
      expect(saved.headSeq).toBe(server.headSeq + 1);
      expect(await revision(server.headRevisionId)).toMatchObject({
        contentHash: server.contentHash,
        document: manuscript(concurrent ? remote : original),
      });
      await page.reload();
      await expectPaper(page, final);
      expect((await head()).contentHash).toBe(saved.contentHash);
    },
  );
}

test('EDITOR-ROUNDTRIP-010 无法识别的技术块可从浏览器副本原样救出，服务器修订保持不变', async ({
  page,
  workspace,
}) => {
  const { first, head } = await prepare(page, workspace.origin);
  const extra = {
    type: 'md:unknown-figure',
    attrs: { layout: '横排' },
    content: [{ type: 'text', text: '未识别的图注' }],
  };
  const copy = {
    ...manuscript(original),
    doc: {
      type: 'doc',
      content: [...manuscript(original).doc.content!, extra],
    },
  };
  const { workspaceId } = await (
    await page.request.get('/api/workspace')
  ).json();
  const record = {
    version: 2,
    workspaceId,
    articleId: first.articleId,
    clientId: await page.evaluate(() =>
      sessionStorage.getItem('inkling-draft-client'),
    ),
    ack: first,
    draft: { document: copy, seq: 1 },
    pending: null,
    updatedAt: Date.now(),
  };
  expect(record.clientId).toBeTruthy();
  const readable = {
    ...record,
    clientId: crypto.randomUUID(),
    draft: { document: manuscript(revised), seq: 1 },
  };
  await page.evaluate(
    (values) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('inkling-drafts', 1);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction('outbox', 'readwrite');
          for (const value of values) tx.objectStore('outbox').put(value);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
        request.onerror = () => reject(request.error);
      }),
    [record, readable],
  );
  await page.reload();
  const button = page.getByRole('button', { name: '下载原始副本' });
  await expect(button).toBeVisible();
  expect((await downloadDraft(page, button)).records).toEqual([record]);
  const recover = page.getByRole('button', { name: '恢复此草稿' });
  await expect(recover).toHaveCount(1);
  await expectPaper(page, original);
  expect((await head()).headRevisionId).toBe(first.headRevisionId);
  await recover.click();
  await expect
    .poll(async () => (await head()).document)
    .toEqual(readable.draft.document);
  await page.reload();
  await expectPaper(page, revised);
  await expect(recover).toHaveCount(0);
  expect((await downloadDraft(page, button)).records).toEqual([record]);
});
