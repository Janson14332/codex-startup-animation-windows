/* Local image import and one-time contour tracing. No network or app privileges. */
(function (scope) {
  'use strict';
  // bounds: [x0,y0,x1,y1] of the sharp picture; edges on or outside its border are ignored
  // so letterbox seams never become strokes. Paths are ranked by length weighted toward
  // the picture centre, which keeps the subject and drops background clutter and specks.
  function vectorize(rgba, width, height, {bounds=[0,0,width,height],threshold=26,minPoints=12,maxPaths=1200}={}) {
    const count=width*height, raw=new Float32Array(count), gray=new Float32Array(count), mag=new Float32Array(count), angle=new Uint8Array(count), edge=new Uint8Array(count);
    for(let i=0;i<count;i++)raw[i]=rgba[i*4]*.299+rgba[i*4+1]*.587+rgba[i*4+2]*.114;
    // Separable 5-tap Gaussian: hair strands and JPEG noise stop producing speckle edges.
    const kernel=[1,4,6,4,1],tmp=new Float32Array(count);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){let sum=0;for(let k=-2;k<=2;k++)sum+=raw[y*width+Math.min(width-1,Math.max(0,x+k))]*kernel[k+2];tmp[y*width+x]=sum/16;}
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){let sum=0;for(let k=-2;k<=2;k++)sum+=tmp[Math.min(height-1,Math.max(0,y+k))*width+x]*kernel[k+2];gray[y*width+x]=sum/16;}
    const [bx0,by0,bx1,by1]=bounds,margin=3;
    const inside=(x,y)=>x>=bx0+margin&&x<bx1-margin&&y>=by0+margin&&y<by1-margin;
    for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
      const i=y*width+x;
      const gx=-gray[i-width-1]+gray[i-width+1]-2*gray[i-1]+2*gray[i+1]-gray[i+width-1]+gray[i+width+1];
      const gy=-gray[i-width-1]-2*gray[i-width]-gray[i-width+1]+gray[i+width-1]+2*gray[i+width]+gray[i+width+1];
      mag[i]=Math.hypot(gx,gy);
      const a=(Math.atan2(gy,gx)*180/Math.PI+180)%180;
      angle[i]=a<22.5||a>=157.5?0:a<67.5?1:a<112.5?2:3;
    }
    const pairs=[[1,-1],[width+1,-width-1],[width,-width],[width-1,-width+1]];
    for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++){
      const i=y*width+x,[a,b]=pairs[angle[i]];
      if(mag[i]>threshold&&mag[i]>=mag[i+a]&&mag[i]>mag[i+b]&&inside(x,y))edge[i]=1;
    }
    const cx=(bx0+bx1)/2,cy=(by0+by1)/2,rx=Math.max(1,(bx1-bx0)/2),ry=Math.max(1,(by1-by0)/2);
    const ranked=[];
    const neighbors=[-width-1,-width,-width+1,-1,1,width-1,width,width+1];
    const visited=new Uint8Array(count), paths=[];
    function walk(start){
      let current=start,previous=-1;const points=[];
      while(current>=0&&!visited[current]){
        visited[current]=1;points.push([current%width,Math.floor(current/width)]);
        let next=-1,best=-Infinity;
        for(const d of neighbors){const n=current+d;if(n<0||n>=count||!edge[n]||visited[n])continue;
          const dx=n%width-current%width,dy=Math.floor(n/width)-Math.floor(current/width);
          const score=previous<0?mag[n]:dx*(current%width-previous%width)+dy*(Math.floor(current/width)-Math.floor(previous/width));
          if(score>best){best=score;next=n;}
        }
        previous=current;current=next;
      }
      if(points.length<minPoints)return;
      let mx=0,my=0;for(const [x,y] of points){mx+=x;my+=y;}
      const dx=(mx/points.length-cx)/rx,dy=(my/points.length-cy)/ry,distance=Math.min(1,Math.hypot(dx,dy)/Math.SQRT2);
      // Centre strokes keep full weight; strokes near the frame must be ~3× longer to survive.
      const score=points.length*(1-.68*distance*distance);
      if(score<minPoints)return;
      ranked.push({score,path:points.filter((_,i)=>i%2===0||i===points.length-1).map(([x,y])=>[Math.round(x*1280/width),Math.round(y*720/height)])});
    }
    // Start at endpoints first, then trace the remaining closed loops.
    for(let i=0;i<count;i++)if(edge[i]&&!visited[i]&&neighbors.reduce((n,d)=>n+(edge[i+d]||0),0)<=1)walk(i);
    for(let i=0;i<count;i++)if(edge[i]&&!visited[i])walk(i);
    return ranked.sort((a,b)=>b.score-a.score).slice(0,maxPaths).map(item=>item.path);
  }
  // Two accent colours from the picture itself: the dominant saturated hue tints the
  // line art, and the strongest hue at least 60° away lights the drawing front.
  function palette(rgba, width, height, {bounds=[0,0,width,height]}={}) {
    const bins=new Float64Array(36),[x0,y0,x1,y1]=bounds;
    for(let y=y0;y<y1;y+=2)for(let x=x0;x<x1;x+=2){
      const i=(y*width+x)*4,r=rgba[i]/255,g=rgba[i+1]/255,b=rgba[i+2]/255;
      const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
      if(max<.25||delta<.12)continue;
      let hue=max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4;
      hue=(hue*60+360)%360;bins[Math.floor(hue/10)%36]+=delta*max; // vivid, bright colours outweigh large dull areas
    }
    const smooth=bins.map((_,i)=>bins[(i+35)%36]*.5+bins[i]+bins[(i+1)%36]*.5);
    let first=-1,second=-1;
    smooth.forEach((value,i)=>{if(value>0&&(first<0||value>smooth[first]))first=i;});
    if(first<0)return {line:'#d7eaff',accent:'#8cb9e0',highlight:'#e8f4ff'};
    smooth.forEach((value,i)=>{const gap=Math.min(Math.abs(i-first),36-Math.abs(i-first));if(gap>=6&&value>smooth[first]*.18&&(second<0||value>smooth[second]))second=i;});
    const hex=(h,s,l)=>{s/=100;l/=100;const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l);
      return '#'+[0,8,4].map(n=>Math.round(255*(l-a*Math.max(-1,Math.min(k(n)-3,9-k(n),1)))).toString(16).padStart(2,'0')).join('');};
    const h1=first*10+5,h2=second<0?h1:second*10+5;
    return {line:hex(h1,70,88),accent:hex(h1,62,70),highlight:hex(h2,90,78)};
  }
  if(typeof module!=='undefined') {module.exports={vectorize,palette};return;}
  async function database(action,value){
    return new Promise((resolve,reject)=>{
      const open=indexedDB.open('aemeath-startup-images',1);
      open.onupgradeneeded=()=>open.result.createObjectStore('settings');
      open.onerror=()=>reject(open.error);
      open.onsuccess=()=>{
        const db=open.result,tx=db.transaction('settings',action==='read'?'readonly':'readwrite'),store=tx.objectStore('settings');
        const request=action==='read'?store.get('images'):store.put(value,'images');
        tx.oncomplete=()=>{db.close();resolve(action==='read'?request.result||{}:value);};
        tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||new Error('保存失败'));};
      };
    });
  }
  async function importImage(file,kind){
    if(file.size>30*1024*1024)throw new Error('请选择小于 30 MB 的图片。');
    if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('请选择 PNG、JPEG 或 WebP 图片。');
    const url=URL.createObjectURL(file),img=new Image();
    try{
      img.src=url;await img.decode();
      const canvas=document.createElement('canvas');canvas.width=kind==='avatar'?512:1280;canvas.height=kind==='avatar'?512:720;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#08060d';ctx.fillRect(0,0,canvas.width,canvas.height);
      const scale=Math.max(canvas.width/img.naturalWidth,canvas.height/img.naturalHeight);
      const w=img.naturalWidth*scale,h=img.naturalHeight*scale;
      ctx.drawImage(img,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
      const image=canvas.toDataURL('image/png');
      if(kind==='avatar')return {avatar:image};
      const small=document.createElement('canvas');small.width=640;small.height=360;
      const smallCtx=small.getContext('2d',{willReadFrequently:true});smallCtx.drawImage(canvas,0,0,640,360);
      const pixels=smallCtx.getImageData(0,0,640,360).data;
      const contours=vectorize(pixels,640,360);
      if(!contours.length)throw new Error('图片轮廓太少，请选择边缘更清晰的背景。');
      return {artwork:image,contours,palette:palette(pixels,640,360)};
    }catch(error){throw new Error(error.message||'图片无法读取，请换一张图片。');}
    finally{URL.revokeObjectURL(url);}
  }
  scope.imageSettings={load:()=>database('read'),save:images=>database('write',images),importImage};
})(typeof window==='undefined'?{}:window);
