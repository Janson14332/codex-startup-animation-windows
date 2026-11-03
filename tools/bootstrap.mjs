import {copyFile,mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const projectRoot=dirname(dirname(fileURLToPath(import.meta.url)));
export async function ensureDefaults(root=projectRoot){
  const assets=join(root,'assets'),config=join(assets,'media-config.json');
  const exists=await stat(config).catch(()=>null);
  if(exists){
    const media=JSON.parse((await readFile(config,'utf8')).replace(/^\uFEFF/,''));
    for(const name of ['artwork.png','contours.js','media-config.js',...(media.type==='video'||!media.type?['reveal.mp4']:[])]){
      if(!(await stat(join(assets,name)).catch(()=>null))?.isFile())throw new Error(`素材不完整：${name}。请重新运行「更换素材.cmd」。`);
    }
    return false;
  }
  await mkdir(assets,{recursive:true});
  for(const name of ['artwork.png','contours.js','media-config.json','media-config.js'])await copyFile(join(root,'examples',name),join(assets,name));
  const sourceDir=join(root,'素材');await mkdir(sourceDir,{recursive:true});
  if(!(await stat(join(sourceDir,'启动图片.png')).catch(()=>null)))await copyFile(join(root,'examples/artwork.png'),join(sourceDir,'启动图片.png'));
  if(!(await stat(join(sourceDir,'素材设置.json')).catch(()=>null)))await writeFile(join(sourceDir,'素材设置.json'),JSON.stringify({file:'启动图片.png',imageDurationSeconds:5},null,2)+'\n');
  return true;
}
if(resolve(process.argv[1]||'')===fileURLToPath(import.meta.url)){
  ensureDefaults().then(created=>console.log(created?'示例素材已初始化。':'已保留当前素材。')).catch(error=>{console.error(error.message);process.exitCode=1;});
}
