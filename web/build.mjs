// page.html + ES 모듈들을 하나로 묶는다.
// - web/index.html : GitHub Pages가 그대로 서비스하는 완성된 문서
// - web/dist/artifact.html : <html>/<head>/<body> 없이 내용만 (Artifact 배포용)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), 'utf8');

/** 모듈 사이의 import/export를 걷어 내 한 스코프에 이어 붙일 수 있게 만든다. */
const flatten = (source) => source
  .replace(/^import\s[\s\S]*?;\s*$/gm, '')
  .replace(/^export\s+/gm, '')
  .trim();

const page = read('page.html');
const [head, body] = page.split('<!-- BODY -->');
if (!body) throw new Error('page.html에 <!-- BODY --> 표시가 없습니다.');

// 순서가 곧 실행 순서다. 정의만 하는 파일부터, 화면을 만드는 app.js를 마지막에.
const bundle = ['origami.js', 'layout.js', 'hinge.js', 'models.js', 'app.js'].map((name) => flatten(read(name))).join('\n\n');
const content = `${head.trim()}\n${body.trim()}\n\n<script type="module">\n${bundle}\n</script>\n`;

const document = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="기기를 접으면 화면 속 종이가 같이 접히는 종이접기. 폴더블에서는 접힘을 자동으로 인식합니다.">
</head>
<body>
${content}</body>
</html>
`;

mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'index.html'), document);
writeFileSync(join(here, 'dist', 'artifact.html'), content);
console.log(`index.html ${document.length}바이트 / dist/artifact.html ${content.length}바이트`);
