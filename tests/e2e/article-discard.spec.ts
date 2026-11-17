import { test, expect } from './fixtures';

for (const sourceState of ['active', 'changed'] as const) {
  test(`ARTICLE-CONFLICT-006 refuses discard when the source became ${sourceState} after confirmation opened`, async ({
    page,
    context,
    workspace,
  }) => {
    page.on('dialog', (dialog) => dialog.accept());
    await page.route('**/api/articles/*/content', (route) =>
      route.abort('failed'),
    );
    await page
      .getByRole('textbox', { name: '文章正文', exact: true })
      .fill('确认时看到的旧副本');
    await expect(
      page.getByRole('button', { name: '重试保存', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('浏览器恢复副本已更新', { exact: true }),
    ).toBeVisible();
    const client = await page.evaluate(() =>
      sessionStorage.getItem('inkling-draft-client'),
    );
    await page.close();
    const review = await context.newPage();
    await review.goto(workspace.origin);
    const panel = review.getByRole('region', { name: '待恢复草稿' });
    await panel
      .getByRole('button', { name: '放弃此副本', exact: true })
      .click();
    const owner = await context.newPage();
    owner.on('dialog', (dialog) => dialog.accept());
    await owner.addInitScript((id) => {
      if (id) sessionStorage.setItem('inkling-draft-client', id);
    }, client);
    await owner.route('**/api/articles/*/content', (route) =>
      route.abort('failed'),
    );
    await owner.goto(workspace.origin);
    await owner
      .getByRole('button', { name: '恢复此草稿', exact: true })
      .click();
    const editor = owner.getByRole('textbox', {
      name: '文章正文',
      exact: true,
    });
    await expect(editor).toBeEditable();
    await editor.fill('确认后又写入的新副本');
    await expect(
      owner.getByRole('button', { name: '重试保存', exact: true }),
    ).toBeVisible();
    await expect(
      owner.getByText('浏览器恢复副本已更新', { exact: true }),
    ).toBeVisible();
    if (sourceState === 'changed') await owner.close();
    await panel
      .getByRole('button', { name: '确认放弃此副本', exact: true })
      .click();
    await expect(panel.getByRole('alert')).toHaveText(
      sourceState === 'active'
        ? '所属标签页仍在使用这份副本，请先关闭该标签页。'
        : '副本已变化或已被处理，请重新查看后决定。',
    );
    await expect(panel).toContainText('确认后又写入的新副本');
    if (sourceState === 'active') {
      await expect(
        panel.getByRole('button', { name: '放弃此副本', exact: true }),
      ).toBeDisabled();
      await owner.close();
    }
    await review.reload();
    await expect(panel).toContainText('确认后又写入的新副本');
    await review.close();
  });
}

test('ARTICLE-CONFLICT-006 discards only the explicitly confirmed recovery copy', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.route('**/api/articles/*/content', (route) =>
    route.abort('failed'),
  );
  const editor = page.getByRole('textbox', { name: '文章正文', exact: true });
  await editor.fill('准备放弃的浏览器草稿');
  await expect(
    page.getByRole('button', { name: '重试保存', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('浏览器恢复副本已更新', { exact: true }),
  ).toBeVisible();
  await page.reload();
  const panel = page.getByRole('region', { name: '待恢复草稿' });
  await expect(
    panel.getByRole('button', { name: '放弃此副本', exact: true }),
  ).toBeVisible();
  await panel.getByRole('button', { name: '放弃此副本', exact: true }).click();
  await panel.getByRole('button', { name: '取消放弃', exact: true }).click();
  await expect(panel).toContainText('准备放弃的浏览器草稿');
  await panel.getByRole('button', { name: '放弃此副本', exact: true }).click();
  await panel.screenshot({ path: 'test-results/conflict-discard-desktop.png' });
  await panel
    .getByRole('button', { name: '确认放弃此副本', exact: true })
    .click();
  await expect(panel).not.toBeVisible();
  await expect(editor).toBeEmpty();
  await page.reload();
  await expect(panel).not.toBeVisible();
  await expect(editor).toBeEmpty();
});
