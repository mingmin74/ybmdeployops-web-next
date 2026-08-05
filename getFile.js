import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const CONFIG = {
  srcRoot: path.resolve(process.cwd(), 'src'),
  outputFile: path.join(
    process.env.USERPROFILE || process.cwd(),
    'Desktop',
    '关联文件提取结果.txt',
  ),
  extensions: ['.js', '.jsx', '.ts', '.tsx', '.vue'],
};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function question(message) {
  return new Promise((resolve) => rl.question(message, resolve));
}

function yesByDefault(answer, defaultValue = true) {
  const value = answer.trim().toLowerCase();
  if (!value) return defaultValue;
  return ['y', 'yes', '是'].includes(value);
}

function importCategory(importPath) {
  if (importPath.startsWith('@/')) return 'alias';
  if (importPath.startsWith('.')) return 'relative';
  return 'external';
}

function getImports(content) {
  const imports = [];
  // Covers `import type`, named/default imports, multiline imports, and side-effect imports.
  const importPattern =
    /^\s*import\s+(?:(type)\s+)?(?:(?:[\s\S]*?)\s+from\s+)?['"]([^'"]+)['"]\s*;?/gm;
  let match;

  while ((match = importPattern.exec(content)) !== null) {
    imports.push({
      statement: match[0],
      path: match[2],
      category: importCategory(match[2]),
      typeOnly: Boolean(match[1]),
    });
  }

  return imports;
}

function stripImports(content) {
  return content
    .replace(
      /^\s*import\s+(?:(?:type)\s+)?(?:(?:[\s\S]*?)\s+from\s+)?['"][^'"]+['"]\s*;?\s*$/gm,
      '',
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function resolveFilePath(currentDir, importPath) {
  let absolutePath;
  if (importPath.startsWith('@/')) {
    absolutePath = path.join(CONFIG.srcRoot, importPath.slice(2));
  } else if (importPath.startsWith('.')) {
    absolutePath = path.resolve(currentDir, importPath);
  } else {
    return null;
  }

  const candidates = [
    absolutePath,
    ...CONFIG.extensions.map((extension) => `${absolutePath}${extension}`),
    ...CONFIG.extensions.map((extension) => path.join(absolutePath, `index${extension}`)),
  ];

  return (
    candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ||
    null
  );
}

function summarizeImports(imports) {
  const summary = {
    total: imports.length,
    alias: 0,
    relative: 0,
    external: 0,
    typeOnly: 0,
    vueComponents: 0,
  };

  imports.forEach((item) => {
    summary[item.category] += 1;
    if (item.typeOnly) summary.typeOnly += 1;
    if (item.path.endsWith('.vue')) summary.vueComponents += 1;
  });
  return summary;
}

function formatImportReport(imports) {
  const summary = summarizeImports(imports);
  const groups = [
    ['项目别名 (@/)', imports.filter((item) => item.category === 'alias')],
    ['相对路径', imports.filter((item) => item.category === 'relative')],
    ['第三方包', imports.filter((item) => item.category === 'external')],
  ];
  const lines = [
    '当前文件 Import 分析',
    `总数: ${summary.total}，项目别名: ${summary.alias}，相对路径: ${summary.relative}，第三方包: ${summary.external}，类型引入: ${summary.typeOnly}，Vue 子组件: ${summary.vueComponents}`,
  ];

  groups.forEach(([title, entries]) => {
    lines.push(`\n[${title}] (${entries.length})`);
    if (!entries.length) lines.push('  - 无');
    entries.forEach((item) => lines.push(`  - ${item.path}${item.typeOnly ? ' (type-only)' : ''}`));
  });
  return lines.join('\n');
}

function createExtractor(options) {
  const processedFiles = new Set();
  const unresolvedFiles = new Set();
  const sections = [];

  function shouldFollow(item) {
    if (item.category === 'external') return false;
    if (item.typeOnly && !options.includeTypeImports) return false;
    if (item.path.endsWith('.vue') && !options.includeVueComponents) return false;
    return true;
  }

  function extract(filePath, allowRecursion = true) {
    const normalizedPath = path.normalize(filePath);
    if (processedFiles.has(normalizedPath)) return;
    processedFiles.add(normalizedPath);
    console.log(`  > 正在读取: ${normalizedPath}`);

    try {
      const content = fs.readFileSync(normalizedPath, 'utf8');
      const imports = getImports(content);
      sections.push(
        `\n${'='.repeat(80)}\nFILE: ${normalizedPath}\n${'='.repeat(80)}\n\n${stripImports(content)}\n`,
      );

      if (!allowRecursion) return;
      imports.filter(shouldFollow).forEach((item) => {
        const resolvedPath = resolveFilePath(path.dirname(normalizedPath), item.path);
        if (resolvedPath) extract(resolvedPath, options.recursive);
        else unresolvedFiles.add(`${normalizedPath} -> ${item.path}`);
      });
    } catch (error) {
      unresolvedFiles.add(
        `${normalizedPath} (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }

  return { extract, processedFiles, unresolvedFiles, sections };
}

async function analysePath(inputPath) {
  const fullPath = path.resolve(inputPath.trim().replace(/^['"]|['"]$/g, ''));
  if (!fs.existsSync(fullPath)) {
    console.log('\x1b[31m路径不存在，请重新输入。\x1b[0m');
    return;
  }
  if (fs.statSync(fullPath).isDirectory()) {
    console.log('\x1b[31m请输入一个 JS、TS 或 Vue 文件路径，以便分析其 import。\x1b[0m');
    return;
  }

  const rootContent = fs.readFileSync(fullPath, 'utf8');
  const rootImports = getImports(rootContent);
  console.log(`\n${formatImportReport(rootImports)}`);

  const includeTypeImports = yesByDefault(
    await question('\n是否递归提取 type-only 引入的本地文件？[y/N] '),
    false,
  );
  const includeVueComponents = yesByDefault(await question('是否递归提取 Vue 子组件？[Y/n] '));
  const recursive = yesByDefault(
    await question('是否继续递归查询所有符合条件的本地 import？[Y/n] '),
  );
  const options = { includeTypeImports, includeVueComponents, recursive };
  const extractor = createExtractor(options);

  console.log('\x1b[33m\n开始提取关联文件...\x1b[0m');
  extractor.extract(fullPath, true);

  const output = [
    `生成时间: ${new Date().toLocaleString()}`,
    `入口文件: ${fullPath}`,
    `项目 src 根目录: ${CONFIG.srcRoot}`,
    `提取选项: type-only=${includeTypeImports ? '保留' : '舍弃'}，Vue 子组件=${includeVueComponents ? '保留' : '舍弃'}，递归=${recursive ? '开启' : '关闭'}`,
    '',
    formatImportReport(rootImports),
    '',
    `实际提取文件数: ${extractor.processedFiles.size}`,
    extractor.unresolvedFiles.size
      ? `未解析本地引入:\n${[...extractor.unresolvedFiles].map((item) => `- ${item}`).join('\n')}`
      : '未解析本地引入: 无',
    ...extractor.sections,
  ].join('\n');

  fs.writeFileSync(CONFIG.outputFile, output, 'utf8');
  console.log(`\n\x1b[32m完成！共提取 ${extractor.processedFiles.size} 个文件。\x1b[0m`);
  console.log(`保存位置: ${CONFIG.outputFile}`);
}

async function start() {
  console.log('\x1b[35m代码依赖递归提取工具已启动...\x1b[0m');
  while (true) {
    console.log('\n\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
    const inputPath = await question('请输入起始文件的绝对路径 (输入 exit 退出): ');
    if (inputPath.trim().toLowerCase() === 'exit') break;
    await analysePath(inputPath);
  }
  rl.close();
  console.log('程序已退出。');
}

void start();
