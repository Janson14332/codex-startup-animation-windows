import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,copyFile,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {updateMedia} from './media-builder.mjs';
import {buildInjection} from '../extension/payload.mjs';
const exec=promisify(execFile),project=dirname(dirname(fileURLToPath(import.meta.url)));
const ffmpeg=process.env.FFMPEG_BIN||'ffmpeg.exe';
const ffprobe=process.env.FFPROBE_BIN||(process.env.FFMPEG_BIN?join(dirname(ffmpeg),'ffprobe.exe'):'ffprobe.exe');
async function frameTimes(path){
  const {stdout}=await exec(ffprobe,['-v','error','-select_streams','v:0','-show_entries','frame=best_effort_timestamp_time','-of','json',path],{windowsHide:true});
  return JSON.parse(stdout).frames.map(frame=>frame.best_effort_timestamp_time);
}

test('图片与视频可互换，图片不依赖视频文件，视频保留逐帧时间',async()=>{
  const root=await mkdtemp(join(tmpdir(),'codex-media-test-'));
  try{
    await mkdir(join(root,'assets'));await mkdir(join(root,'extension'));
    for(const name of ['index.html','style.css','image-settings.js','animation.js','extension/wallpaper.css'])await copyFile(join(project,name),join(root,name));
    const image=join(root,'自定义 图片.PNG');
    await copyFile(join(project,'assets/artwork.png'),image);
    await writeFile(join(root,'assets/reveal.mp4'),'old video');
    const media=await updateMedia({root,input:image,ffmpeg,ffprobe});
    assert.equal(media.type,'image');assert.equal(media.durationMs,5000);
    assert.equal(await stat(join(root,'assets/reveal.mp4')).catch(()=>null),null);
    const imageInjection=await buildInjection(root);new Function(imageInjection);
    assert.match(imageInjection,/"reveal":null/);
    const settingsPath=join(root,'素材/素材设置.json');
    const settings=JSON.parse(await readFile(settingsPath,'utf8'));
    assert.equal(settings.file,'启动图片.png');
    settings.imageDurationSeconds=2;await writeFile(settingsPath,JSON.stringify(settings));
    assert.equal((await updateMedia({root,ffmpeg,ffprobe})).durationMs,2000);
    const before=await readFile(join(root,'assets/media-config.json'),'utf8');
    const bad=join(root,'损坏 图片.jpg');await writeFile(bad,'not an image');
    await assert.rejects(updateMedia({root,input:bad,ffmpeg,ffprobe}));
    assert.equal(await readFile(join(root,'assets/media-config.json'),'utf8'),before);
    const video=join(root,'自定义 视频.mp4');
    await exec(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=320x180:rate=24:duration=2','-vf',"select='not(eq(mod(n,3),1))'",'-an','-c:v','libx264','-pix_fmt','yuv420p','-fps_mode','passthrough',video],{windowsHide:true});
    const changed=await updateMedia({root,input:video,ffmpeg,ffprobe});
    assert.equal(changed.type,'video');
    assert.deepEqual(await frameTimes(join(root,'assets/reveal.mp4')),await frameTimes(video));
    assert.ok((await stat(join(root,'素材/启动图片.png'))).isFile());
    assert.equal(JSON.parse(await readFile(settingsPath,'utf8')).file,'启动视频.mp4');
    const videoInjection=await buildInjection(root);new Function(videoInjection);
    assert.match(videoInjection,/"reveal":"data:video\/mp4;base64,[A-Za-z0-9+/]/);
  }finally{
    if(!resolve(root).startsWith(resolve(tmpdir())+sep)||!root.includes('codex-media-test-'))throw new Error('Unsafe test cleanup path');
    await rm(root,{recursive:true,force:true});
  }
});
