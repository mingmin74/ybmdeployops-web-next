import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeSSH } from 'node-ssh';

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(projectDir, 'dist', 'spa');
const remoteDir = '/usr/share/pve-manager';
const backupDir = '/root/pve-manager-deploy-backups';
const host = process.env.PVE_DEPLOY_HOST || '192.168.2.109';
const port = Number(process.env.PVE_DEPLOY_PORT || 22);
const username = process.env.PVE_DEPLOY_USER || 'root';
const password = process.env.PVE_DEPLOY_PASSWORD;
const skipBuild = process.argv.includes('--skip-build');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const stagingDir = `/root/.pve-manager-deploy-${stamp}`;
const backupFile = `${backupDir}/pve-manager-${stamp}.tar.gz`;

function quote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

async function runRemote(ssh, command) {
  const result = await ssh.execCommand(command);
  if (result.code !== 0) {
    throw new Error(`远程命令失败 (${result.code}): ${result.stderr || command}`);
  }
  return result.stdout.trim();
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('用法: 设置 PVE_DEPLOY_PASSWORD 后运行 node deploy-pve.js [--skip-build]');
    return;
  }
  if (!password) throw new Error('请先设置环境变量 PVE_DEPLOY_PASSWORD。');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PVE_DEPLOY_PORT 必须是有效端口。');
  }

  if (!skipBuild) {
    console.log('==> 构建前端');
    execSync('npm run build', { cwd: projectDir, stdio: 'inherit', shell: true });
  }

  const indexFile = path.join(distDir, 'index.html');
  if (!existsSync(indexFile)) throw new Error(`缺少构建入口: ${indexFile}`);
  const entries = readdirSync(distDir).filter((name) => name !== 'index.html');
  if (!entries.includes('assets') || !statSync(path.join(distDir, 'assets')).isDirectory()) {
    throw new Error(`缺少构建资源目录: ${path.join(distDir, 'assets')}`);
  }
  const indexHash = createHash('sha256').update(readFileSync(indexFile)).digest('hex');
  const ssh = new NodeSSH();

  try {
    console.log(`==> 连接 ${host}:${port}`);
    await ssh.connect({ host, port, username, password, readyTimeout: 15000 });
    await runRemote(
      ssh,
      `test -d ${quote(remoteDir)} && test -f ${quote(`${remoteDir}/index.html.tpl`)}`
    );
    await runRemote(ssh, `mkdir -p ${quote(stagingDir)} ${quote(backupDir)}`);

    console.log('==> 上传构建产物到临时目录');
    const uploaded = await ssh.putDirectory(distDir, stagingDir, {
      recursive: true,
      concurrency: 5,
    });
    if (!uploaded) throw new Error('上传构建产物失败。');
    await runRemote(
      ssh,
      `test -s ${quote(`${stagingDir}/index.html`)} && test -d ${quote(`${stagingDir}/assets`)}`
    );

    console.log(`==> 备份当前页面: ${backupFile}`);
    await runRemote(ssh, `tar -C /usr/share -czf ${quote(backupFile)} pve-manager`);

    console.log('==> 发布静态资源并切换页面入口');
    for (const entry of entries) {
      await runRemote(ssh, `cp -a ${quote(`${stagingDir}/${entry}`)} ${quote(`${remoteDir}/`)}`);
    }
    await runRemote(
      ssh,
      `cp ${quote(`${stagingDir}/index.html`)} ${quote(`${remoteDir}/.index.html.tpl.deploy`)} && ` +
        `chmod 644 ${quote(`${remoteDir}/.index.html.tpl.deploy`)} && ` +
        `mv -f ${quote(`${remoteDir}/.index.html.tpl.deploy`)} ${quote(`${remoteDir}/index.html.tpl`)}`
    );

    const remoteHash = (
      await runRemote(ssh, `sha256sum ${quote(`${remoteDir}/index.html.tpl`)}`)
    ).split(' ')[0];
    if (remoteHash !== indexHash) throw new Error('线上入口文件哈希与本地构建不一致。');
    const status = await runRemote(
      ssh,
      "curl -ksS --max-time 15 -o /dev/null -w '%{http_code}' https://127.0.0.1:8006/"
    );
    if (!['200', '302'].includes(status)) throw new Error(`pveproxy 页面检查失败: HTTP ${status}`);

    console.log(`部署完成: https://${host}:8006/`);
    console.log(`回退备份: ${backupFile}`);
  } finally {
    if (ssh.isConnected()) {
      try {
        await runRemote(ssh, `rm -rf ${quote(stagingDir)}`);
      } catch (error) {
        console.error('清理临时目录失败:', error);
      }
    }
    ssh.dispose();
  }
}

main().catch((error) => {
  console.error('部署失败:', error);
  process.exitCode = 1;
});
