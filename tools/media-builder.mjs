import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {dirname, extname, join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot=dirname(dirname(fileURLToPath(import.meta.url)));
const images=new Set(['.png','.jpg','.jpeg','.webp','.bmp']);
const videos=new Set(['.mp4','.mov','.m4v','.mkv','.webm','.avi']);
const pictureFilter='scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1';
async function run(bin,args){
  return new Promise((done,reject)=>{
    const child=spawn(bin,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
    const output=[],errors=[];
    child.stdout.on('data',chunk=>output.push(chunk));
    child.stderr.on('data',chunk=>errors.push(chunk));
    child.once('error',error=>reject(new Error(`${bin} 无法运行：${error.message}`)));
    child.once('close',code=>code===0?done(Buffer.concat(output)):reject(new Error(`${bin} 失败 (${code})：${Buffer.concat(errors).toString().slice(-1400)}`)));
  });
}

export async function updateMedia({root=projectRoot,input:argument,ffmpeg=process.env.FFMPEG_BIN||'ffmpeg.exe',ffprobe=process.env.FFPROBE_BIN||(process.env.FFMPEG_BIN?join(dirname(ffmpeg),'ffprobe.exe'):'ffprobe.exe')}={}){
  const assets=join(root,'assets'),sourceDir=join(root,'素材');
  const settingsPath=join(sourceDir,'素材设置.json');
  let settings={file:'启动视频.mp4',imageDurationSeconds:5};
  try{settings={...settings,...JSON.parse((await readFile(settingsPath,'utf8')).replace(/^\uFEFF/,''))};}
  catch(error){if(error.code!=='ENOENT')throw new Error('素材/素材设置.json 无法读取，请检查 JSON 格式。');}
  if(typeof settings.file!=='string')throw new Error('素材设置中的 file 必须是素材文件名。');
  const configured=resolve(sourceDir,settings.file);
  if(!configured.startsWith(resolve(sourceDir)+sep))throw new Error('素材设置中的文件必须位于素材文件夹内。');
  const input=resolve(argument||configured),extension=extname(input).toLowerCase();
  const type=images.has(extension)?'image':videos.has(extension)?'video':null;
  if(!type)throw new Error('请选择 MP4、MOV、M4V、MKV、WebM、AVI 视频，或 PNG、JPG、JPEG、WebP、BMP 图片。');
  if(!(await stat(input).catch(()=>null))?.isFile())throw new Error(`找不到素材：${input}`);
  async function probe(path){
    const data=JSON.parse((await run(ffprobe,['-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',path])).toString());
    if(!data.streams?.some(stream=>stream.codec_type==='video'&&stream.width>0&&stream.height>0))throw new Error('素材中没有可读取的画面。');
    return Number(data.format?.duration);
  }
  const inputDuration=await probe(input);
  if(type==='video'&&(!Number.isFinite(inputDuration)||inputDuration<1||inputDuration>120))throw new Error('请选择 1 到 120 秒的视频。');
  const imageSeconds=Number(settings.imageDurationSeconds);
  if(!Number.isFinite(imageSeconds)||imageSeconds<1||imageSeconds>120)throw new Error('素材设置中的 imageDurationSeconds 应为 1 到 120 秒。');
  await mkdir(assets,{recursive:true});
  const stage=await mkdtemp(join(assets,'.media-build-'));
  if(!resolve(stage).startsWith(resolve(assets)+sep))throw new Error('临时目录超出了项目素材目录。');
  try{
    const movie=join(stage,'reveal.mp4'),still=join(stage,'artwork.png'),raw=join(stage,'pixels.rgba');
    let duration;
    if(type==='video'){
      console.log('1/4 正在转换视频（1280×720、保留原始帧时间、静音）…');
      await run(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',input,'-an','-vf',pictureFilter,
        '-c:v','libx264','-preset','medium','-crf','25','-pix_fmt','yuv420p','-fps_mode','passthrough','-movflags','+faststart',movie]);
      duration=await probe(movie);
      if((await stat(movie)).size>40*1024*1024)throw new Error('转换后的视频超过 40 MB，请选择更短的视频。');
      console.log('2/4 正在提取最后一帧…');
      await run(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',movie,'-an','-f','image2','-update','1',still]);
    }else{
      console.log('1/4 正在读取图片…');
      console.log('2/4 正在生成背景（1280×720）…');
      await run(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',input,'-an','-vf',pictureFilter,'-frames:v','1',still]);
      duration=imageSeconds;
    }
    console.log('3/4 正在生成线稿…');
    await run(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',still,'-vf','scale=640:360,format=rgba','-frames:v','1','-f','rawvideo',raw]);
    const pixels=await readFile(raw);
    if(pixels.length!==640*360*4)throw new Error('素材无法生成线稿。');
    const {vectorize}=createRequire(import.meta.url)(join(root,'image-settings.js'));
    const contours=vectorize(pixels,640,360);
    if(!contours.length)throw new Error('画面没有可用轮廓，请选择边缘更清晰的素材。');
    const durationMs=Math.round(duration*1000);
    const id=createHash('sha256').update(`${type}:${durationMs}:`).update(await readFile(type==='video'?movie:still)).digest('hex').slice(0,16);
    const media={id,type,durationMs};
    await writeFile(join(stage,'contours.js'),`window.CONTOUR_PATHS=${JSON.stringify(contours)};\n`);
    await writeFile(join(stage,'media-config.json'),JSON.stringify(media,null,2)+'\n');
    await writeFile(join(stage,'media-config.js'),`window.AEMEATH_MEDIA=${JSON.stringify(media)};\n`);
    const sourceName=(type==='image'?'启动图片':'启动视频')+extension;
    const source=join(sourceDir,sourceName);
    await mkdir(sourceDir,{recursive:true});
    // Finish decoding and tracing before replacing any active animation assets.
    if(input.toLowerCase()!==resolve(source).toLowerCase())await copyFile(input,source);
    console.log('4/4 正在更新预览、启动素材和配置…');
    const names=['artwork.png','contours.js',...(type==='video'?['reveal.mp4']:[]),'media-config.json','media-config.js'];
    for(const name of names)await copyFile(join(stage,name),join(assets,name));
    await writeFile(settingsPath,JSON.stringify({file:sourceName,imageDurationSeconds:imageSeconds},null,2)+'\n');
    if(type==='image')await rm(join(assets,'reveal.mp4'),{force:true});
    console.log(`完成：${type==='video'?'视频':'图片渐亮'} ${duration.toFixed(2)} 秒，线稿 ${contours.length} 条。预览和正式启动已同步。`);
    return media;
  }finally{await rm(stage,{recursive:true,force:true});}
}
