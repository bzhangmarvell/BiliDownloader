// 测试批量下载 API
const axios = require('axios');

// 从 store 读取 cookie
const Store = require('electron-store');
const store = new Store({ name: 'auth' });

const authData = store.store;
console.log('Auth data:', authData);

if (!authData || !authData.cookie) {
  console.error('没有找到 cookie，请先登录');
  process.exit(1);
}

const cookie = authData.cookie;
console.log('Cookie:', cookie.substring(0, 30) + '...');

// 测试获取 UP 主信息
async function testGetUpInfo() {
  const mid = 123456; // 测试 UP 主 ID
  
  try {
    console.log('\n=== 测试获取 UP 主信息 ===');
    const response = await axios.get('https://api.bilibili.com/x/space/acc/info', {
      params: { mid },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Cookie': cookie,
        'Referer': 'https://www.bilibili.com',
      },
    });
    
    console.log('响应码:', response.data.code);
    console.log('UP 主:', response.data.data?.name);
  } catch (error) {
    console.error('获取 UP 主信息失败:', error.response?.data || error.message);
  }
}

// 测试获取视频列表
async function testGetUpVideos() {
  const mid = 123456; // 测试 UP 主 ID
  
  try {
    console.log('\n=== 测试获取视频列表 ===');
    const response = await axios.get('https://api.bilibili.com/x/space/wbi/arc/search', {
      params: { mid, pn: 1, ps: 30 },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Cookie': cookie,
        'Referer': 'https://www.bilibili.com',
      },
    });
    
    console.log('响应码:', response.data.code);
    console.log('视频数量:', response.data.data?.list?.vlist?.length || 0);
    if (response.data.data?.list?.vlist?.length > 0) {
      console.log('第一个视频:', response.data.data.list.vlist[0].title);
    }
  } catch (error) {
    console.error('获取视频列表失败:', error.response?.data || error.message);
  }
}

// 运行测试
(async () => {
  await testGetUpInfo();
  await testGetUpVideos();
  process.exit(0);
})();
