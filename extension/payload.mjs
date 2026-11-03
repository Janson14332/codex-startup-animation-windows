import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {installRenderer} from './renderer.mjs';
export async function buildInjection(root){
  const media=JSON.parse(await readFile(join(root,'assets/media-config.json'),'utf8'));
  media.type??='video';
  if(!['video','image'].includes(media.type)||!Number.isFinite(media.durationMs)||media.durationMs<1000||media.durationMs>120000)throw new Error('素材配置无效，请运行「更新动画.cmd」');
  const [html,css,skin,settings,contours,animation,artwork,reveal]=await Promise.all([
    'index.html','style.css','extension/wallpaper.css','image-settings.js','assets/contours.js','animation.js','assets/artwork.png',media.type==='video'?'assets/reveal.mp4':null
  ].map(name=>name?readFile(join(root,name)):null));
  const payload={html:html.toString().replace(/<!doctype[^>]*>/ig,'').replace(/<html[^>]*>|<\/html>/ig,'')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/ig,'').replace(/<link\b[^>]*>/ig,'')
    .replace(/<meta\b[^>]*http-equiv[^>]*>/ig,'').replace(/src="assets\/[^"]*"/g,'src=""'),
    css:css.toString(),skin:skin.toString(),media,assets:{artwork:'data:image/png;base64,'+artwork.toString('base64'),reveal:reveal?'data:video/mp4;base64,'+reveal.toString('base64'):null}};
  // Bind animation globals to the temporary iframe so removing it stops its work.
  const mount=`function(window){const document=window.document,location=window.location,performance=window.performance,indexedDB=window.indexedDB,Image=window.Image,Path2D=window.Path2D,URL=window.URL,module=undefined;const requestAnimationFrame=window.requestAnimationFrame.bind(window),cancelAnimationFrame=window.cancelAnimationFrame.bind(window);\n${settings}\n${contours}\n${animation}\n}`;
  return `(${installRenderer.toString()})(${JSON.stringify(payload)},${mount})`;
}
