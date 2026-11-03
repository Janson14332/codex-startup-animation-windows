(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const drawingEnd = 3000;
  const scrambleStart = 3250;
  const videoStart = 4550;
  const media=window.AEMEATH_MEDIA||{id:'original',durationMs:9913};
  const imageMode=media.type==='image';
  const videoDuration = Math.max(1000,Math.round(Number(media.durationMs)||9913));
  const closeStart = videoStart + videoDuration;
  const duration = closeStart + 787;
  const durationLabel=(duration/1000).toFixed(1);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const native = !window.AEMEATH_EXTERNAL && Boolean(window.webkit?.messageHandlers?.launcher);
  const embedded = window.parent!==window && (window.AEMEATH_EXTERNAL || new URLSearchParams(location.search).has('embedded'));
  const assets=window.AEMEATH_ASSETS||{artwork:'assets/artwork.png',reveal:'assets/reveal.mp4'};
  if(embedded)document.body.classList.add('embedded');
  const root = $('.window'), art = $('.artwork'), scene = $('.scene');
  const video = $('.reveal-video');
  const hud = $('.hud'), intro = $('.intro'), sweep = $('.light-sweep');
  const slider = $('#timeline'), pause = $('#pause');
  slider.max=String(duration/1000);
  $('#clip-duration').textContent=imageMode?`自定义图片 · ${(videoDuration/1000).toFixed(1)} 秒渐亮 · 可随时跳过`:`完整 ${(videoDuration/1000).toFixed(1)} 秒视频 · 可随时跳过`;
  $('#media-description').textContent=`当前使用${imageMode?'图片渐亮':'完整视频'}。要同步更换预览与正式启动的素材，请使用桌面「Codex 更换启动素材」。这里可临时覆盖当前环境的背景与线稿。`;
  $('#elapsed').innerHTML=`00.0 <span>/ ${durationLabel}s</span>`;
  let playing = false, elapsed = 0, origin = 0, frame = 0, lastUI = -Infinity;
  let completed = false, hiddenPause = false, pendingVisibleStart = false, mode = 'preview', loaded = false, revealed = false;
  let customArtwork = false, videoAvailable = !imageMode&&Boolean(assets.reveal);
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
  const send = (action, details={}) => {
    if(native)window.webkit.messageHandlers.launcher.postMessage(action);
    if(embedded){const data={type:'aemeath-boot',action,...details};if(window.AEMEATH_EXTERNAL)window.AEMEATH_SEND(data);else window.parent.postMessage(data,'*');}
  };
  const particles = Array.from({length: reduced ? 0 : 14}, (_, i) => {
    const node = document.createElement('i'); node.className = 'particle';
    const size = i % 4 === 0 ? 3 : 1.5;
    Object.assign(node.style, {width:`${size}px`,height:`${size}px`,left:`${(i*37+7)%100}%`,top:`${(i*23+17)%100}%`});
    $('.particles').appendChild(node); return node;
  });
  function progress(t) {
    return clamp(t/duration);
  }
  // Split the selected image's own contours once; no particles are allocated per frame.
  const canvas = $('.line-art'), ctx = canvas.getContext('2d');
  function preparePaths(raw) { return raw.map(points => {
    let total=0;
    for(let i=1;i<points.length;i++)total+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);
    const full=new Path2D();points.forEach((point,i)=>i?full.lineTo(...point):full.moveTo(...point));
    return {points,total,full};
  }); }
  function prepareFragments(paths){
    const result=[],span=Math.max(18,paths.reduce((sum,path)=>sum+path.total,0)/1400);
    const noise=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
    function add(points){
      if(points.length<2)return;
      const first=points[0],last=points[points.length-1],x=(first[0]+last[0])/2,y=(first[1]+last[1])/2;
      const seed=result.length+1,phase=noise(seed+811)*Math.PI*2;
      result.push({x,y,points:points.map(point=>[point[0]-x,point[1]-y]),
        sx:(x+(noise(seed)-.5)*380+1280)%1280,sy:(y+(noise(seed+271)-.5)*240+720)%720,
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
  let lastTrace=-1;
  function trace(p,drift=0) {
    const stamp=p===1?1:p+drift*.00001;
    if(stamp===lastTrace)return;lastTrace=stamp;
    ctx.clearRect(0,0,1280,720);
    ctx.strokeStyle='#d7eaff';ctx.lineWidth=1.35;ctx.lineCap='round';ctx.lineJoin='round';
    if(p===1){
      ctx.globalAlpha=1;paths.forEach(path=>ctx.stroke(path.full));
    }else{
      ctx.globalAlpha=.82;ctx.beginPath();
      // Arrival time follows target X, so the left edge resolves before the face and right edge.
      const front=p*1.5-.25;
      const swayX=drift*.8,swayY=drift*.6;
      const sinX=Math.sin(swayX),cosX=Math.cos(swayX),sinY=Math.sin(swayY),cosY=Math.cos(swayY);
      for(const fragment of fragments){
        const arrival=smooth((front-fragment.x/1280+.16)/.32),loose=1-arrival;
        const angle=fragment.angle*loose,cs=Math.cos(angle),sn=Math.sin(angle);
        const x=fragment.sx*loose+fragment.x*arrival+(sinX*fragment.cosSeed+cosX*fragment.sinSeed)*7*loose;
        const y=fragment.sy*loose+fragment.y*arrival+(cosY*fragment.cosSeed-sinY*fragment.sinSeed)*7*loose;
        const size=.16+.84*arrival;
        const points=fragment.points;
        for(let i=0;i<points.length;i++){
          const point=points[i];
          const px=x+(point[0]*cs-point[1]*sn)*size,py=y+(point[0]*sn+point[1]*cs)*size;
          if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);
        }
      }
      ctx.stroke();ctx.globalAlpha=1;
    }
    canvas.dataset.progress=p.toFixed(3);canvas.dataset.fragments=String(fragments.length);
  }
  function disperse(p){
    lastTrace=-1;
    ctx.clearRect(0,0,1280,720);
    const scatter=smooth(p),fade=1-smooth((p-.35)/.65);
    if(fade<=0)return;
    ctx.strokeStyle='#d7eaff';ctx.lineWidth=1.35;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.globalAlpha=fade;ctx.beginPath();
    for(const fragment of fragments){
      const angle=fragment.angle*scatter,cs=Math.cos(angle),sn=Math.sin(angle);
      const x=fragment.x+(fragment.sx-fragment.x)*scatter;
      const y=fragment.y+(fragment.sy-fragment.y)*scatter;
      const size=1-.78*scatter;
      const points=fragment.points;
      for(let i=0;i<points.length;i++){
        const point=points[i];
        const px=x+(point[0]*cs-point[1]*sn)*size;
        const py=y+(point[0]*sn+point[1]*cs)*size;
        if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);
      }
    }
    ctx.stroke();ctx.globalAlpha=1;
    canvas.dataset.disperse=p.toFixed(3);
  }
  function render(t) {
    const s=t/1000, p=progress(t);
    const closing=t>=closeStart, collapse=smooth((t-closeStart)/420), pinch=smooth((t-(duration-360))/360);
    root.classList.toggle('closing',closing);document.body.classList.toggle('closing',closing);
    scene.style.opacity=collapse>=1?'0':'1';
    scene.style.transform=`scaleY(${Math.max(.001,1-collapse)})`;
    scene.style.filter=closing?`brightness(${1+collapse*3})`:'none';
    $('.transition-flash').style.opacity='0';
    const line=$('.shutter-line');
    line.style.opacity=String(smooth((t-closeStart-150)/150)*(1-smooth((t-duration+60)/60)));
    line.style.transform=`scaleX(${1-pinch})`;
    if(closing&&!revealed){revealed=true;send('reveal');}

    intro.style.opacity=String(1-smooth((t-450)/350));
    $('.pulse').style.opacity=String(1-smooth((t-320)/430));
    document.querySelectorAll('.pulse i').forEach((ring,i)=>{
      const phase=(s*1.15+i*.5)%1;
      ring.style.transform=`scale(${.25+phase*.9})`;ring.style.opacity=String((1-phase)*.8);
    });
    const drawing=clamp((t-650)/(drawingEnd-650));
    if(t>=650&&t<scrambleStart)trace(reduced?1:drawing,s);
    else if(t>=scrambleStart&&t<=videoStart)disperse((t-scrambleStart)/(videoStart-scrambleStart));
    canvas.style.opacity=String(smooth((t-550)/350)*(1-smooth((t-videoStart)/100)));
    canvas.dataset.dissolve='1.000';
    const useVideo=!customArtwork&&videoAvailable;
    video.style.opacity=String(useVideo?smooth((t-videoStart)/220):0);
    video.style.visibility=useVideo&&t>=videoStart?'visible':'hidden';
    art.style.opacity=String(useVideo?smooth((t-closeStart+300)/260):smooth((t-videoStart)/280));
    art.style.filter=useVideo?'none':`brightness(${.07+.93*smooth((t-videoStart)/videoDuration)})`;
    art.style.transform='none';
    $('.shade').style.opacity=String(smooth((t-videoStart)/1200)*.26);
    hud.style.opacity=String(smooth((t-videoStart-350)/600));
    $('.sync-fill').style.transform=`scaleX(${p})`;
    sweep.style.opacity='0';
    particles.forEach((node,i)=>{
      node.style.opacity=String(smooth((t-videoStart)/1200)*(.1+.22*(.5+.5*Math.sin(s*.9+i))));
      node.style.transform=`translate(${Math.sin(s*.4+i)*8}px,${-s*(2+i%3)}px)`;
    });
    if(Math.abs(t-lastUI)>60 || t===0 || t>=duration) {
      lastUI=t;
      $('#ratio').textContent=`${(p*100).toFixed(2).padStart(5,'0')}%`;
      $('.sync-phase').textContent=t<videoStart?'TRACING':t<closeStart?'ILLUMINATING':'SYNC COMPLETE';
      $('#timecode').textContent=`00:${String(Math.floor(s)).padStart(2,'0')}:${String(Math.floor(s%1*30)).padStart(2,'0')}`;
      slider.value=String(s);
      $('#elapsed').innerHTML=`${s.toFixed(1).padStart(4,'0')} <span>/ ${durationLabel}s</span>`;
      root.dataset.elapsed=s.toFixed(2);
      root.dataset.stage=closing?'shutter':t<650?'pulse':t<scrambleStart?'drawing':t<videoStart?'dispersing':'illuminating';
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
    const target=Math.min(lastFrameTime,Math.max(0,(elapsed-videoStart)/1000));
    try{
      if(Math.abs(video.currentTime-target)>.22)video.currentTime=target;
      if(elapsed<videoStart||elapsed>=closeStart||!playing){if(!video.paused)video.pause();return;}
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
  const settings=$('#settings-dialog'),status=$('#settings-status');
  function thumbnails(){
    $('#artwork-preview').src=pendingImages.artwork||assets.artwork;
    $('#wallpaper-strength').value=String(pendingImages.wallpaperStrength??42);
    $('#wallpaper-value').textContent=$('#wallpaper-strength').value+'%';
  }
  function openSettings(){
    if(mode==='launch'||settings.open)return;
    hiddenPause=false;stop();pendingImages={...savedImages};thumbnails();
    status.textContent='图片保存在本机。修改后点击「保存并预览」；关闭则放弃本次修改。';
    settings.returnValue='';settings.showModal();send('settings-open');
  }
  function setBusy(value){
    busy=value;
    settings.querySelectorAll('input,button').forEach(node=>node.disabled=value);
  }
  async function applyImages(images){
    customArtwork=Boolean(images.artwork);
    art.src=images.artwork||assets.artwork;
    await art.decode();
    paths=preparePaths(images.contours||window.CONTOUR_PATHS||[]);fragments=prepareFragments(paths);lastTrace=-1;
    if(!paths.length)throw new Error('图片轮廓数据缺失');
    send('background',{image:art.src,strength:images.wallpaperStrength??42});
  }
  $('#wallpaper-strength').addEventListener('input',event=>{
    pendingImages.wallpaperStrength=Number(event.target.value);
    $('#wallpaper-value').textContent=event.target.value+'%';
  });
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
      delete images.artwork;delete images.contours;delete images.avatar;
      await window.imageSettings.save(images).catch(()=>{});
    }
    if('artworkSubtitle' in images){delete images.artworkSubtitle;await window.imageSettings.save(images).catch(()=>{});}
    savedImages=images;
    try{await applyImages(images);}catch{savedImages={};await applyImages({});}
    ready();
  }).catch(failed);
})();
