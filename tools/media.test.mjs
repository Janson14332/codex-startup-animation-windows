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
    assert.equal(media.type,'image');assert.equal(media.durationMs,2000);
    assert.match(media.palette.line,/^#[0-9a-f]{6}$/);
    assert.equal(await stat(join(root,'assets/reveal.mp4')).catch(()=>null),null);
    const imageInjection=await buildInjection(root);new Function(imageInjection);
    assert.match(imageInjection,/"reveal":null/);
    const settingsPath=join(root,'素材/素材设置.json');
    const settings=JSON.parse(await readFile(settingsPath,'utf8'));
    assert.equal(settings.file,'启动图片.png');
    settings.imageDurationSeconds=3;await writeFile(settingsPath,JSON.stringify(settings));
    assert.equal((await updateMedia({root,ffmpeg,ffprobe})).durationMs,3000);
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

test('动图转为视频并循环到 gifSeconds，单帧 GIF 按图片处理',async()=>{
  const root=await mkdtemp(join(tmpdir(),'codex-media-test-'));
  try{
    await mkdir(join(root,'assets'));await mkdir(join(root,'extension'));
    for(const name of ['index.html','style.css','image-settings.js','animation.js','extension/wallpaper.css'])await copyFile(join(project,name),join(root,name));
    // 0.6 s animated GIF, square, so it also exercises the blurred side fill.
    const animated=join(root,'循环 动图.gif');
    await exec(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=240x240:rate=10:duration=0.6',animated],{windowsHide:true});
    const media=await updateMedia({root,input:animated,ffmpeg,ffprobe});
    assert.equal(media.type,'video');
    // Default gifSeconds 4 → 7 whole plays of 0.6 s.
    assert.ok(media.durationMs>=4000&&media.durationMs<=4400,`duration ${media.durationMs}`);
    assert.ok((await stat(join(root,'assets/reveal.mp4'))).isFile());
    const settings=JSON.parse(await readFile(join(root,'素材/素材设置.json'),'utf8'));
    assert.equal(settings.file,'启动动图.gif');assert.equal(settings.gifSeconds,4);
    const injection=await buildInjection(root);new Function(injection);
    assert.match(injection,/"reveal":"data:video\/mp4;base64,/);
    const still=join(root,'静态.gif');
    await exec(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=320x180','-frames:v','1',still],{windowsHide:true});
    const image=await updateMedia({root,input:still,ffmpeg,ffprobe});
    assert.equal(image.type,'image');
    assert.equal(await stat(join(root,'assets/reveal.mp4')).catch(()=>null),null);
  }finally{
    if(!resolve(root).startsWith(resolve(tmpdir())+sep)||!root.includes('codex-media-test-'))throw new Error('Unsafe test cleanup path');
    await rm(root,{recursive:true,force:true});
  }
});
