import { execFileSync } from 'node:child_process';
export default function build() {
  execFileSync('corepack', ['pnpm', 'build'], { stdio: 'inherit' });
}
