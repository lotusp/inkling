import type { Locator } from '@playwright/test';
export async function openRevisionMenu(panel: Locator, seq: number) {
  const more = panel.getByRole('button', {
    name: '版本 #' + seq + '的更多操作',
    exact: true,
  });
  const backups = panel.getByRole('button', { name: /查看自动备份/ });
  await more.or(backups).first().waitFor();
  if (!(await more.isVisible())) await backups.click();
  await more.click();
}
