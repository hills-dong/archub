import { execFileSync } from 'node:child_process'
export default function globalSetup() {
  // 为 lifly 建当前快照，使对比模式有 base 可选（幂等：同 SHA 快照重复跑不报错）
  execFileSync('node', ['../dist/cli.js', 'snapshot', '--project', '/home/hills/projects/lifly'], { stdio: 'inherit' })
}
