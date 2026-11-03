import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {cp,mkdir,mkdtemp,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureDefaults} from './bootstrap.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url))),exec=promisify(execFile);
const version=JSON.parse(await readFile(join(root,'package.json'),'utf8')).version;
const build=join(root,'.build'),dist=join(root,'dist');
await mkdir(build,{recursive:true});await mkdir(dist,{recursive:true});
const stage=await mkdtemp(join(build,'package-'));
const temporary=join(dist,`codex-startup-animation-windows-${version}-${Date.now()}.tmp.zip`);
try{
  const app=join(stage,'Codex-Startup-Animation-Windows');await mkdir(app);
  const files=['package.json','README.md','NOTICE.md','CHANGELOG.md','.gitignore','.gitattributes','.editorconfig','animation.js','image-settings.js','index.html','style.css','launch-windows.ps1','安装项目.cmd','更换素材.cmd','更新动画.cmd','扩展启动Codex.cmd','预览动画.cmd','assets/README.md','素材/README.md'];
  for(const name of files){await mkdir(dirname(join(app,name)),{recursive:true});await cp(join(root,name),join(app,name));}
  for(const name of ['extension','tools','examples','docs'])await cp(join(root,name),join(app,name),{recursive:true});
  await ensureDefaults(app);
  await exec('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(root,'tools/archive.ps1'),'-Source',app,'-Destination',temporary],{windowsHide:true});
  const archive=join(dist,`codex-startup-animation-windows-v${version}.zip`);
  await rename(temporary,archive);
  const hash=createHash('sha256').update(await readFile(archive)).digest('hex');
  await writeFile(archive+'.sha256',hash+'  '+archive.split(/[\\/]/).at(-1)+'\n');
  console.log(`ZIP: ${archive}\nSHA256: ${hash}\nPackage contains the neutral demo only; local media is excluded.`);
}finally{
  if(!resolve(stage).startsWith(resolve(build)+sep))throw new Error('Unsafe package cleanup path');
  await rm(stage,{recursive:true,force:true});await rm(temporary,{force:true});
}
