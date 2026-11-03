(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const media=window.AEMEATH_MEDIA||{id:'original',durationMs:9913};
  const imageMode=media.type==='image';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const videoDuration = Math.max(1000,Math.round(Number(media.durationMs)||9913));
  // One clock drives every stage. The picture rises *beneath* the finished line art, so
  // the strokes visibly turn into the image instead of vanishing into a dark gap.
  const drawStart = reduced ? 0 : 400;        // fragments start gathering
  const drawEnd = reduced ? 0 : 2200;         // complete line art
  const revealStart = reduced ? 0 : 2500;     // picture/video begins under the strokes
  const lineOutStart = revealStart + 300;     // strokes loosen and fade over the picture
  const lineOutEnd = lineOutStart + (reduced ? 0 : 1000);
  const revealDuration = imageMode ? (reduced ? 600 : videoDuration) : videoDuration;
  const closeStart = revealStart + revealDuration;
  const closeLength = reduced ? 400 : 700;    // settle onto the Codex wallpaper, then fade
  const duration = closeStart + closeLength;
  const durationLabel=(duration/1000).toFixed(1);
  const native = !window.AEMEATH_EXTERNAL && Boolean(window.webkit?.messageHandlers?.launcher);
  const embedded = window.parent!==window && (window.AEMEATH_EXTERNAL || new URLSearchParams(location.search).has('embedded'));
  const assets=window.AEMEATH_ASSETS||{artwork:'assets/artwork.png',reveal:'assets/reveal.mp4'};
  if(embedded)document.body.classList.add('embedded');
  if(reduced)document.body.classList.add('reduced-motion');
  const root = $('.window'), art = $('.artwork'), scene = $('.scene');
  const video = $('.reveal-video'), wash = $('.end-wash'), shade = $('.shade');
  const hud = $('.hud'), intro = $('.intro'), pulseNode = $('.pulse'), syncFill = $('.sync-fill');
  const ratioText = $('#ratio'), phaseText = $('.sync-phase'), timecode = $('#timecode'), elapsedText = $('#elapsed');
  const slider = $('#timeline'), pause = $('#pause');
  const rings = Array.from(document.querySelectorAll('.pulse i'));
  slider.max=String(duration/1000);
  $('#clip-duration').textContent=imageMode?`自定义图片 · ${(videoDuration/1000).toFixed(1)} 秒渐亮 · 点击画面或 Esc 跳过`:`完整 ${(videoDuration/1000).toFixed(1)} 秒视频 · 点击画面或 Esc 跳过`;
  $('#media-description').textContent=`当前使用${imageMode?'图片渐亮':'完整视频'}。要同步更换预览与正式启动的素材，请使用桌面「Codex 更换启动素材」。这里可临时覆盖当前环境的背景与线稿。`;
  elapsedText.innerHTML=`00.0 <span>/ ${durationLabel}s</span>`;
  let playing = false, elapsed = 0, origin = 0, frame = 0, lastUI = -Infinity;
  let completed = false, hiddenPause = false, pendingVisibleStart = false, mode = 'preview', loaded = false, revealed = false;
  let customArtwork = false, videoAvailable = !imageMode&&Boolean(assets.reveal);
  let wallpaperStrength = 42, washTarget = .58;
  if(videoAvailable&&embedded&&assets.reveal.startsWith('data:video/mp4;base64,')){
    const binary=window.atob(assets.reveal.slice(22)),bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    const url=URL.createObjectURL(new window.Blob([bytes],{type:'video/mp4'}));
    video.src=url;
    window.addEventListener('pagehide',()=>URL.revokeObjectURL(url),{once:true});
  }else if(videoAvailable)video.src=assets.reveal;
  video.muted=true;
  video.addEventListener('error',()=>{videoAvailable=false;});
  const clamp = n => Math.max(0, Math.min(1, n));
  const smooth = n => { const t = clamp(n); return t*t*(3-2*t); };
  const easeOut = n => 1-Math.pow(1-clamp(n),3);
  const easeIn = n => Math.pow(clamp(n),2);
  const send = (action, details={}) => {
    if(native)window.webkit.messageHandlers.launcher.postMessage(action);
    if(embedded){const data={type:'aemeath-boot',action,...details};if(window.AEMEATH_EXTERNAL)window.AEMEATH_SEND(data);else window.parent.postMessage(data,'*');}
  };
  // Colours come from the picture (see palette() in image-settings.js).
  const defaultPalette={line:'#d7eaff',accent:'#8cb9e0',highlight:'#e8f4ff'};
  let colors=defaultPalette;
  function applyPalette(value){
    const valid=c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c);
    colors=value&&valid(value.line)&&valid(value.accent)&&valid(value.highlight)?value:defaultPalette;
    const style=document.documentElement?.style;
    if(style?.setProperty){style.setProperty('--accent',colors.accent);style.setProperty('--line',colors.line);style.setProperty('--highlight',colors.highlight);}
    lastTrace=-1;
  }
  const particles = Array.from({length: reduced ? 0 : 14}, (_, i) => {
    const node = document.createElement('i'); node.className = 'particle';
    const size = i % 4 === 0 ? 3 : 1.5;
    Object.assign(node.style, {width:`${size}px`,height:`${size}px`,left:`${(i*37+7)%100}%`,top:`${(i*23+17)%100}%`});
    $('.particles').appendChild(node); return node;
  });
  // Split the selected image's own contours once; no particles are allocated per frame.
  const canvas = $('.line-art'), ctx = canvas.getContext('2d');
  let canvasScale = 0, lastTrace = -1, cleared = true;
  // Back the canvas at the displayed pixel density so strokes stay crisp on 4K / 150 % scaling.
  function fitCanvas(){
    const w=canvas.clientWidth||1280,h=canvas.clientHeight||720;
    const scale=Math.min(2.5,Math.max(1,(window.devicePixelRatio||1)*Math.max(w/1280,h/720)));
    if(Math.abs(scale-canvasScale)<.05)return;
    canvasScale=scale;canvas.width=Math.round(1280*scale);canvas.height=Math.round(720*scale);
    ctx.setTransform(scale,0,0,scale,0,0);lastTrace=-1;
  }
  fitCanvas();window.addEventListener('resize',()=>{fitCanvas();if(!playing)render(elapsed);});
  function preparePaths(raw) { return raw.map(points => {
    let total=0;
    for(let i=1;i<points.length;i++)total+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);
    const full=new Path2D();points.forEach((point,i)=>i?full.lineTo(...point):full.moveTo(...point));
    return {points,total,full};
  }); }
  function prepareFragments(paths){
    const result=[],span=Math.max(18,paths.reduce((sum,path)=>sum+path.total,0)/1400);
    const noise=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
    const within=(value,low,high)=>Math.max(low,Math.min(high,value));
    function add(points){
      if(points.length<2)return;
      const first=points[0],last=points[points.length-1],x=(first[0]+last[0])/2,y=(first[1]+last[1])/2;
      const seed=result.length+1,phase=noise(seed+811)*Math.PI*2;
      // Start positions stay near their target (clamped, never wrapped across the frame).
      result.push({x,y,points:points.map(point=>[point[0]-x,point[1]-y]),
        sx:within(x+(noise(seed)-.5)*380,-30,1310),sy:within(y+(noise(seed+271)-.5)*240,-30,750),
        angle:(noise(seed+563)-.5)*Math.PI*2,seed:phase,sinSeed:Math.sin(phase),cosSeed:Math.cos(phase)});
    }
    for(const path of paths){
      if(path.points.length<2)continue;
      let chunk=[path.points[0]],used=0;
      for(let i=1;i<path.points.length;i++){
        let a=path.points[i-1];const b=path.points[i];
        let length=Math.hypot(b[0]-a[0],b[1]-a[1]);
        while(length>0&&used+length>=span){
          const ratio=(span-used)/length,cut=[a[0]+(b[0]-a[0])*ratio,a[1]+(b[1]-a[1])*ratio];
          chunk.push(cut);add(chunk);chunk=[cut];a=cut;used=0;
          length=Math.hypot(b[0]-a[0],b[1]-a[1]);
        }
        if(length>0){chunk.push(b);used+=length;}
      }
      add(chunk);
    }
    return result;
  }
  let paths=preparePaths(window.CONTOUR_PATHS || []),fragments=prepareFragments(paths);
  applyPalette(media.palette);
  function addFragment(path,fragment,x,y,angle,size){
    const cs=Math.cos(angle),sn=Math.sin(angle),points=fragment.points;
    for(let i=0;i<points.length;i++){
      const point=points[i];
      const px=x+(point[0]*cs-point[1]*sn)*size,py=y+(point[0]*sn+point[1]*cs)*size;
      if(i)path.lineTo(px,py);else path.moveTo(px,py);
    }
  }
  function clearLines(){if(!cleared){ctx.clearRect(0,0,1280,720);cleared=true;lastTrace=-1;}}
  // p: gathering progress 0..1. glow: 0..1 emphasis while the finished drawing holds.
  function trace(p,drift=0,glow=0) {
    const stamp=p===1?1+glow:p+drift*.00001;
    if(stamp===lastTrace)return;lastTrace=stamp;cleared=false;
    ctx.clearRect(0,0,1280,720);
    ctx.lineCap='round';ctx.lineJoin='round';
    if(p===1){
      ctx.strokeStyle=colors.line;ctx.lineWidth=1.35+.5*glow;ctx.globalAlpha=.88+.12*glow;
      paths.forEach(path=>ctx.stroke(path.full));
    }else{
      // Arrival time follows target X: a sweep from left to right. Fragments that are
      // landing right now form a brighter front in the picture's secondary colour.
      const settled=new Path2D(),front=new Path2D();
      const edge=p*1.5-.25;
      const swayX=drift*.8,swayY=drift*.6;
      const sinX=Math.sin(swayX),cosX=Math.cos(swayX),sinY=Math.sin(swayY),cosY=Math.cos(swayY);
      for(const fragment of fragments){
        const arrival=smooth((edge-fragment.x/1280+.16)/.32),loose=1-arrival;
        const x=fragment.sx*loose+fragment.x*arrival+(sinX*fragment.cosSeed+cosX*fragment.sinSeed)*7*loose;
        const y=fragment.sy*loose+fragment.y*arrival+(cosY*fragment.cosSeed-sinY*fragment.sinSeed)*7*loose;
        addFragment(arrival>.3&&arrival<.92?front:settled,fragment,x,y,fragment.angle*loose,.16+.84*arrival);
      }
      ctx.globalAlpha=.8;ctx.strokeStyle=colors.line;ctx.lineWidth=1.35;ctx.stroke(settled);
      ctx.globalAlpha=1;ctx.strokeStyle=colors.highlight;ctx.lineWidth=1.8;ctx.stroke(front);
    }
    ctx.globalAlpha=1;
    canvas.dataset.progress=p.toFixed(3);canvas.dataset.fragments=String(fragments.length);
  }
  // Strokes loosen slightly and fade while the picture brightens beneath them.
  function disperse(p){
    lastTrace=-1;cleared=false;
    ctx.clearRect(0,0,1280,720);
    const scatter=.45*easeIn(p),fade=1-smooth(p);
    if(fade<=0)return;
    ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=colors.line;ctx.lineWidth=1.35;ctx.globalAlpha=fade*.9;
    const path=new Path2D();
    for(const fragment of fragments){
      addFragment(path,fragment,fragment.x+(fragment.sx-fragment.x)*scatter,fragment.y+(fragment.sy-fragment.y)*scatter,fragment.angle*scatter,1-.5*scatter);
    }
    ctx.stroke(path);ctx.globalAlpha=1;
    canvas.dataset.disperse=p.toFixed(3);
  }
  // Match the final frame to what Codex shows underneath: the wallpaper under the same wash.
  function readWash(){
    let base='20 18 24';
    try{
      if(embedded&&window.parent!==window){
        const value=window.parent.getComputedStyle(window.parent.document.body).backgroundColor.match(/[\d.]+/g);
        if(value&&value.length>=3&&(value[3]===undefined||Number(value[3])>0))base=value.slice(0,3).join(' ');
      }
    }catch{}
    wash.style.background=`rgb(${base})`;
    return wallpaperStrength>0?1-wallpaperStrength/100:1;
  }
  function render(t) {
    const s=t/1000;
    const closing=t>=closeStart,c=clamp((t-closeStart)/closeLength);
    root.classList.toggle('closing',closing);document.body.classList.toggle('closing',closing);
    if(closing&&!revealed){revealed=true;washTarget=readWash();send('reveal');}
    scene.style.opacity=String(1-smooth((c-.35)/.65));
    scene.style.transform=reduced||!closing?'none':`scale(${1+.035*easeIn(c)})`;
    wash.style.opacity=String(closing?smooth(c/.55)*washTarget:0);

    intro.style.opacity=String(reduced?0:1-smooth((t-250)/350));
    if(!reduced&&t<700){
      pulseNode.style.opacity=String(1-smooth((t-200)/450));
      rings.forEach((ring,i)=>{
        const phase=(s*1.15+i*.5)%1;
        ring.style.transform=`scale(${.25+phase*.9})`;ring.style.opacity=String((1-phase)*.8);
      });
    }
    const drawing=clamp((t-drawStart)/Math.max(1,drawEnd-drawStart));
    if(reduced)clearLines();
    else if(t>=drawStart&&t<lineOutStart)trace(drawing,s,t>=drawEnd?Math.sin(Math.PI*clamp((t-drawEnd)/(lineOutStart-drawEnd))):0);
    else if(t>=lineOutStart&&t<lineOutEnd)disperse((t-lineOutStart)/(lineOutEnd-lineOutStart));
    else clearLines();
    canvas.style.opacity=String(reduced?0:smooth((t-drawStart+150)/300));
    canvas.dataset.dissolve='1.000';
    const useVideo=!customArtwork&&videoAvailable;
    video.style.opacity=String(useVideo?smooth((t-revealStart)/(reduced?300:600)):0);
    video.style.visibility=useVideo&&t>=revealStart?'visible':'hidden';
    art.style.opacity=String(useVideo?smooth((t-closeStart+300)/260):smooth((t-revealStart)/(reduced?300:600)));
    // Starts at a readable brightness and eases out, so there is never a near-black stretch.
    art.style.filter=useVideo?'none':`brightness(${.32+.68*easeOut((t-revealStart)/revealDuration)})`;
    shade.style.opacity=String(smooth((t-revealStart)/1200)*.26);
    // The HUD frames the drawing only; it steps aside once the picture appears.
    hud.style.opacity=String(reduced?0:smooth((t-drawStart)/400)*(1-smooth((t-revealStart)/500)));
    syncFill.style.transform=`scaleX(${drawing})`;
    particles.forEach((node,i)=>{
      node.style.opacity=String(smooth((t-revealStart)/1200)*(1-c)*(.1+.22*(.5+.5*Math.sin(s*.9+i))));
      node.style.transform=`translate(${Math.sin(s*.4+i)*8}px,${-s*(2+i%3)}px)`;
    });
    if(Math.abs(t-lastUI)>60 || t===0 || t>=duration) {
      lastUI=t;
      ratioText.textContent=`${(drawing*100).toFixed(2).padStart(5,'0')}%`;
      phaseText.textContent=t<drawEnd?'TRACING':t<lineOutStart?'SYNC COMPLETE':'ILLUMINATING';
      timecode.textContent=`00:${String(Math.floor(s)).padStart(2,'0')}:${String(Math.floor(s%1*30)).padStart(2,'0')}`;
      slider.value=String(s);
      elapsedText.innerHTML=`${s.toFixed(1).padStart(4,'0')} <span>/ ${durationLabel}s</span>`;
      root.dataset.elapsed=s.toFixed(2);
      root.dataset.stage=closing?'closing':reduced?'illuminating':t<drawStart?'pulse':t<lineOutStart?'drawing':t<lineOutEnd?'dispersing':'illuminating';
    }
  }
  function updateButton() { pause.textContent=playing?'暂停':'继续'; root.dataset.playing=String(playing); }
  function stop() { playing=false; pendingVisibleStart=false; cancelAnimationFrame(frame); frame=0; video.pause(); updateButton(); }
  function finish(skipped=false) {
    stop(); elapsed=duration; render(elapsed); completed=true;
    root.classList.add('finished'); root.dataset.completed='true';
    pause.textContent='已结束'; pause.disabled=true;
    $('.end-description').textContent=mode==='launch'?'正在显示 Codex…':skipped?'已跳过开场动画':'开场预览结束';
    send('complete');
  }
  function tick(now) {
    if(!playing)return;
    elapsed=Math.min(duration,now-origin); syncVideo(); render(elapsed);
    if(elapsed>=duration){finish();return;}
    frame=requestAnimationFrame(tick);
  }
  let videoStarting=false;
  function syncVideo(){
    if(customArtwork||!videoAvailable)return;
    const lastFrameTime=Number.isFinite(video.duration)&&video.duration>0?Math.max(0,video.duration-.001):videoDuration/1000;
    const target=Math.min(lastFrameTime,Math.max(0,(elapsed-revealStart)/1000));
    try{
      if(Math.abs(video.currentTime-target)>.22)video.currentTime=target;
      if(elapsed<revealStart||elapsed>=closeStart||!playing){if(!video.paused)video.pause();return;}
      if(video.paused&&!videoStarting){
        videoStarting=true;
        video.play().catch(()=>{videoAvailable=false;render(elapsed);}).finally(()=>{videoStarting=false;});
      }
    }catch{videoAvailable=false;video.pause();}
  }
  function play() {
    if(!loaded)return;
    if(elapsed>=duration)elapsed=0;
    if(embedded&&document.hidden){pendingVisibleStart=true;send('paused');return;}
    pendingVisibleStart=false;hiddenPause=false;
    completed=false; root.classList.remove('finished'); root.dataset.completed='false';
    pause.disabled=false; origin=performance.now()-elapsed; playing=true;updateButton();
    syncVideo();cancelAnimationFrame(frame);frame=requestAnimationFrame(tick);
    if(embedded)send('playing');
  }
  function replay(){revealed=false;hiddenPause=false;stop();elapsed=0;lastUI=-Infinity;syncVideo();render(0);play();}
  $('#replay').addEventListener('click',replay);$('.replay-end').addEventListener('click',replay);
  pause.addEventListener('click',()=>{hiddenPause=false;if(playing){elapsed=Math.min(duration,performance.now()-origin);stop();render(elapsed);}else play();});
  $('.skip').addEventListener('click',()=>finish(true));
  // Clicking anywhere on the running animation skips it, as the hint says.
  root.addEventListener('click',event=>{
    if(completed||!loaded||settings.open||event.target.closest?.('button,dialog,input,label,select,a'))return;
    finish(true);
  });
  slider.addEventListener('input',()=>{hiddenPause=false;stop();elapsed=Number(slider.value)*1000;syncVideo();if(elapsed>=duration){finish();return;}lastUI=-Infinity;completed=false;root.classList.remove('finished');root.dataset.completed='false';pause.disabled=false;render(elapsed);});
  window.addEventListener('keydown',event=>{
    if((event.metaKey||event.ctrlKey)&&event.altKey&&event.code==='KeyB'){
      event.preventDefault();if(!$('#settings-dialog').open)openSettings();return;
    }
    if($('#settings-dialog').open)return;
    if(event.key==='Escape'){event.preventDefault();finish(true);}
    if(event.code==='Space'&&event.target.tagName!=='INPUT'&&event.target.tagName!=='BUTTON'){event.preventDefault();pause.click();}
  });
  document.addEventListener('visibilitychange',()=>{
    if(native)return;
    if(document.hidden&&playing){elapsed=Math.min(duration,performance.now()-origin);hiddenPause=true;stop();if(embedded)send('paused');}
    else if(!document.hidden&&pendingVisibleStart&&!completed){pendingVisibleStart=false;play();}
    else if(!document.hidden&&hiddenPause&&!completed){hiddenPause=false;play();}
  });
  // Narrow native bridge: the host may select launch mode or report its own launch error.
  window.launcherUI={
    openSettings,
    beginLaunch(){mode='launch';document.body.classList.add('launch-mode');replay();},
    error(message){stop();scene.style.opacity='0';root.classList.add('finished');$('.end-description').textContent=message;$('.eyebrow').textContent='LAUNCH UNAVAILABLE';$('.end-screen h1').textContent='暂时无法打开 Codex';},
    waiting(){ $('.end-description').textContent='正在等待 Codex 打开…'; }
  };
  if(native){
    document.body.classList.add('native');
  }
  async function ready(){
    if(loaded)return;
    if(!customArtwork&&videoAvailable&&video.readyState<2){
      await new Promise(resolve=>{
        const done=()=>{clearTimeout(timer);video.removeEventListener('loadeddata',done);video.removeEventListener('error',done);resolve();};
        const timer=setTimeout(()=>{videoAvailable=false;done();},5000);
        video.addEventListener('loadeddata',done,{once:true});video.addEventListener('error',done,{once:true});
      });
    }
    loaded=true;render(0);send('ready');
    if(window.AEMEATH_OPEN_SETTINGS||new URLSearchParams(location.search).has('settings'))openSettings();else play();
  }
  function failed(){stop();$('#asset-error').hidden=false;send('assetError');}
  let savedImages={},pendingImages={},busy=false;
  // Horizontal focus of the cover-cropped picture, shared by the overlay and the wallpaper.
  const focusPositions={left:'25%',center:'50%',right:'75%'};
  const settings=$('#settings-dialog'),status=$('#settings-status');
  function thumbnails(){
    $('#artwork-preview').src=pendingImages.artwork||assets.artwork;
    $('#wallpaper-strength').value=String(pendingImages.wallpaperStrength??42);
    $('#wallpaper-value').textContent=$('#wallpaper-strength').value+'%';
    $('#wallpaper-focus').value=focusPositions[pendingImages.wallpaperFocus]?pendingImages.wallpaperFocus:'center';
  }
  function openSettings(){
    if(mode==='launch'||settings.open)return;
    hiddenPause=false;stop();pendingImages={...savedImages};thumbnails();
    status.textContent='图片保存在本机。修改后点击「保存并预览」；关闭则放弃本次修改。';
    settings.returnValue='';settings.showModal();send('settings-open');
  }
  function setBusy(value){
    busy=value;
    settings.querySelectorAll('input,button,select').forEach(node=>node.disabled=value);
  }
  async function applyImages(images){
    customArtwork=Boolean(images.artwork);
    art.src=images.artwork||assets.artwork;
    await art.decode();
    paths=preparePaths(images.contours||window.CONTOUR_PATHS||[]);fragments=prepareFragments(paths);lastTrace=-1;
    if(!paths.length)throw new Error('图片轮廓数据缺失');
    applyPalette(images.artwork?images.palette:media.palette);
    wallpaperStrength=Number.isFinite(images.wallpaperStrength)?images.wallpaperStrength:42;
    const focus=focusPositions[images.wallpaperFocus]||'50%';
    art.style.objectPosition=`${focus} 50%`;
    send('background',{image:art.src,strength:wallpaperStrength,focus});
  }
  $('#wallpaper-strength').addEventListener('input',event=>{
    pendingImages.wallpaperStrength=Number(event.target.value);
    $('#wallpaper-value').textContent=event.target.value+'%';
  });
  $('#wallpaper-focus').addEventListener('change',event=>{pendingImages.wallpaperFocus=event.target.value;});
  $('#image-settings').addEventListener('click',openSettings);
  if(window.AEMEATH_EXTERNAL){$('#restore-appearance').hidden=false;$('#restore-appearance').addEventListener('click',()=>send('restore'));}
  settings.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  settings.addEventListener('close',()=>{
    if(!loaded)return;
    if(settings.returnValue==='preview'){send('settings-close');replay();}
    else finish(true);
  });
  $('#artwork-file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    setBusy(true);status.textContent='正在为新背景生成线稿…';
    // Let the progress text paint before the one-time contour computation.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    try{
      pendingImages={...pendingImages,...await window.imageSettings.importImage(file,'artwork')};thumbnails();
      status.textContent='图片已准备好，点击「保存并预览」应用。';
    }catch(error){status.textContent=error.message;}
    finally{setBusy(false);event.target.value='';}
  });
  $('#reset-images').addEventListener('click',()=>{pendingImages={artworkVersion:`${media.type||'video'}-${media.id}`};thumbnails();status.textContent=`已选用${imageMode?'当前素材图片':'视频最后一帧'}，点击「保存并预览」应用。`;});
  $('#preview-images').addEventListener('click',async()=>{
    setBusy(true);status.textContent='正在保存…';
    try{
      await applyImages(pendingImages);await window.imageSettings.save(pendingImages);savedImages={...pendingImages};settings.close('preview');
    }catch(error){await applyImages(savedImages);status.textContent='保存失败，原设置已保留：'+error.message;}
    finally{setBusy(false);}
  });
  window.imageSettings.load().catch(()=>({})).then(async images=>{
    // The previous release stored a different artwork and avatar. Keep wallpaper
    // strength, but replace its image with this video's final frame.
    const mediaVersion=`${media.type||'video'}-${media.id}`;
    if(images.artworkVersion!==mediaVersion){
      images={...images,artworkVersion:mediaVersion};
      delete images.artwork;delete images.contours;delete images.avatar;delete images.palette;
      await window.imageSettings.save(images).catch(()=>{});
    }
    if('artworkSubtitle' in images){delete images.artworkSubtitle;await window.imageSettings.save(images).catch(()=>{});}
    savedImages=images;
    try{await applyImages(images);}catch{savedImages={};await applyImages({});}
    ready();
  }).catch(failed);
})();
