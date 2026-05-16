const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'dist', 'renderer', 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

html = html.replace(/src="\/(?!assets\/)/g, 'src="./');

fs.writeFileSync(htmlPath, html, 'utf8');
