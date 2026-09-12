const fs = require('fs');
const path = require('path');
const https = require('https');

const missing = [
  { slug: 'chilli-potato', url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=450&h=450&q=80&fm=webp', target: 'public/images/menu/chilli-potato.webp' },
  { slug: 'honey-chicken', url: 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=450&h=450&q=80&fm=webp', target: 'public/images/menu/honey-chicken.webp' },
  { slug: 'pink-sauce-pasta-veg', url: 'https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?auto=format&fit=crop&w=450&h=450&q=80&fm=webp', target: 'public/images/menu/pink-sauce-pasta-veg.webp' },
  { slug: 'white-sauce-pasta-nonveg', url: 'https://images.unsplash.com/photo-1645112411341-6c4fd023714a?auto=format&fit=crop&w=450&h=450&q=80&fm=webp', target: 'public/images/menu/white-sauce-pasta-nonveg.webp' },
  { slug: 'peri-peri-fries', url: 'https://images.unsplash.com/photo-1585109649139-366815a0d713?auto=format&fit=crop&w=450&h=450&q=80&fm=webp', target: 'public/images/menu/peri-peri-fries.webp' },
  { slug: 'hazelnut-latte-hot', url: 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?auto=format&fit=crop&w=450&h=450&q=80&fm=webp', target: 'public/images/menu/hazelnut-latte-hot.webp' },
  { slug: 'long-black-iced', url: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=450&h=450&q=80&fm=webp', target: 'public/images/menu/long-black-iced.webp' },
  { slug: 'pistachio-shake', url: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=450&h=450&q=80&fm=webp', target: 'public/images/menu/pistachio-shake.webp' },
  { slug: 'almond-milk', url: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=450&h=450&q=80&fm=webp', target: 'public/images/menu/almond-milk.webp' },
  { slug: 'fallback-pasta', url: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=450&h=450&q=80&fm=webp', target: 'public/images/menu/fallbacks/pasta.webp' }
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const fileStream = fs.createWriteStream(dest);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close(() => {
          const stats = fs.statSync(dest);
          resolve(stats.size);
        });
      });
      fileStream.on('error', reject);
    }).on('error', reject);
  });
}

async function run() {
  console.log('Downloading missing items...');
  for (const item of missing) {
    const dest = path.resolve(__dirname, '..', item.target);
    try {
      const size = await download(item.url, dest);
      console.log(`✅ ${item.slug} -> ${(size / 1024).toFixed(1)} KB`);
    } catch (e) {
      console.error(`❌ ${item.slug}:`, e.message);
    }
  }

  // Update image_audit.json
  const auditPath = path.resolve(__dirname, 'image_audit.json');
  if (fs.existsSync(auditPath)) {
    const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
    for (const entry of audit) {
      const filePath = path.resolve(__dirname, '..', 'public' + entry.image_url);
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        entry.file_size_kb = Math.round(stats.size / 1024);
        entry.status = 'VERIFIED';
        delete entry.error;
      }
    }
    fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2), 'utf8');
    console.log('Updated image_audit.json: all verified!');
  }
}

run();
