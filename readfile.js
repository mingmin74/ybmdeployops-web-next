import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { fileURLToPath } from 'url';

// 获取脚本当前所在的项目目录
const __filename = fileURLToPath(import.meta.url);
const defaultProjectDir = path.dirname(__filename);

// 自动获取系统桌面路径
const desktopDir = path.join(os.homedir(), 'Desktop');

// 封装一个干净的单行问答函数
function askQuestion(rl, query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

// 封装多行粘贴收集函数（独立处理输入流，避免缓冲区干扰）
function collectMultilines() {
  return new Promise((resolve) => {
    const rlMulti = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    let rawInputLines = [];

    rlMulti.on('line', (line) => {
      const trimmed = line.trim();
      // 当检测到空行，且已经收集到了有效路径时，结束收集
      if (!trimmed) {
        if (rawInputLines.length > 0) {
          rlMulti.close();
        }
      } else {
        rawInputLines.push(trimmed);
      }
    });

    rlMulti.on('close', () => {
      resolve(rawInputLines);
    });
  });
}

// 获取格式化时间戳 (HHMMSS)
function getTimeStamp() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${hh}${mm}${ss}`;
}

async function runExtractionTask() {
  console.log('----------------------------------------------------------------');

  // 每次创建新的 readline 交互，确保状态干净
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // 1. 获取根目录路径
  const inputDir = await askQuestion(rl, `请输入根目录路径 (直接回车默认: ${defaultProjectDir}): `);
  const baseDir = inputDir.trim() ? path.resolve(inputDir.trim()) : defaultProjectDir;

  // 关闭单行 readline，准备接收多行输入
  rl.close();

  // 获取根目录文件夹名称
  const folderName = path.basename(baseDir);
  console.log(`\n📂 当前根目录设置为: ${baseDir} (文件夹名: ${folderName})\n`);

  // 2. 收集多行粘贴
  console.log('📋 请直接【粘贴】你所有的文件路径（支持多行、空格或逗号分隔）：');
  console.log('👉 粘贴完成后，按【两次回车】开始提取：\n');

  const rawInputLines = await collectMultilines();

  // 解析输入的路径
  const fullInputText = rawInputLines.join('\n');
  const customFilePaths = fullInputText
    .split(/[\r\n, ]+/)
    .map((p) => p.trim().replace(/^['"]|['"]$/g, ''))
    .filter((p) => p.length > 0);

  if (customFilePaths.length === 0) {
    console.log('\n⚠️ 未检测到任何文件路径，已取消本次提取。\n');
    return;
  }

  // 3. 开始读取并处理文件
  console.log(`\n🚀 解析出 ${customFilePaths.length} 个文件路径，开始提取...\n`);

  let outputContent = '';
  let successCount = 0;

  customFilePaths.forEach((filePath) => {
    const absolutePath = path.resolve(baseDir, filePath);

    if (fs.existsSync(absolutePath)) {
      try {
        const content = fs.readFileSync(absolutePath, 'utf-8');

        outputContent += `================================================================\n`;
        outputContent += `FILE: ${filePath}\n`;
        outputContent += `================================================================\n\n`;
        outputContent += content;
        outputContent += `\n\n\n`;

        successCount++;
        console.log(`[成功] 已读取: ${filePath}`);
      } catch (err) {
        console.error(`[错误] 读取文件失败: ${filePath}`, err.message);
      }
    } else {
      console.warn(`[跳过] 文件不存在: ${absolutePath}`);
    }
  });

  // 4. 保存到桌面（带时间戳防止覆盖）
  if (successCount > 0) {
    const timeStr = getTimeStamp();
    // 文件名格式：[文件夹名]下的X个提取文件_时分秒.txt
    const outputFileName = `${folderName}下的${successCount}个提取文件_${timeStr}.txt`;
    const outputPath = path.join(desktopDir, outputFileName);

    fs.writeFileSync(outputPath, outputContent, 'utf-8');
    console.log(`\n✅ 提取完成！已保存至桌面：`);
    console.log(`👉 ${outputPath}\n`);
  } else {
    console.log('\n❌ 没有成功提取到任何文件内容，未生成目标文件。\n');
  }
}

async function main() {
  console.log('🎉 文件提取工具已启动！（随时可按 Ctrl + C 退出程序）\n');

  // 无限循环
  while (true) {
    await runExtractionTask();
  }
}

main();
