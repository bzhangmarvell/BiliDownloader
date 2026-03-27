/**
 * 自动发布脚本
 * 构建完成后自动增加版本号并提交
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = require(packageJsonPath);

const currentVersion = packageJson.version;
const [major, minor, patch] = currentVersion.split('.').map(Number);

// 自动增加 patch 版本号
const newVersion = `${major}.${minor}.${patch + 1}`;
packageJson.version = newVersion;

fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

console.log(`版本号从 ${currentVersion} 更新到 ${newVersion}`);

// 自动提交更改
try {
  execSync('git add package.json', { stdio: 'inherit' });
  execSync(`git commit -m "chore: 发布版本 ${newVersion}"`, { stdio: 'inherit' });
  execSync('git push origin main', { stdio: 'inherit' });
  console.log('已推送到 GitHub');
} catch (e) {
  console.log('提交或推送失败:', e.message);
}