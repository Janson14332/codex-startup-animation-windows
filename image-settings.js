/* Local image import and one-time contour tracing. No network or app privileges. */
(function (scope) {
  'use strict';
  // bounds: [x0,y0,x1,y1] of the sharp picture; edges on or outside its border are ignored
  // so letterbox seams never become strokes. Paths are ranked by length weighted toward
  // the picture centre, which keeps the subject and drops background clutter and specks.
  // Soft or low-contrast material retries with a lower edge threshold until there is
  // enough line art to animate (minPaths), so any picture with visible shapes works.
  function vectorize(rgba, width, height, {bounds=[0,0,width,height],threshold=26,minPoints=12,maxPaths=1200,minPaths=40}={}) {
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
    const cx=(bx0+bx1)/2,cy=(by0+by1)/2,rx=Math.max(1,(bx1-bx0)/2),ry=Math.max(1,(by1-by0)/2);
    const neighbors=[-width-1,-width,-width+1,-1,1,width-1,width,width+1];
    const visited=new Uint8Array(count);
    let ranked=[];
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
    let best=[];
    for(const level of [threshold,threshold*.6,threshold*.36,threshold*.22]){
      edge.fill(0);visited.fill(0);ranked=[];
      for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++){
        const i=y*width+x,[a,b]=pairs[angle[i]];
        if(mag[i]>level&&mag[i]>=mag[i+a]&&mag[i]>mag[i+b]&&inside(x,y))edge[i]=1;
      }
      // Start at endpoints first, then trace the remaining closed loops.
      for(let i=0;i<count;i++)if(edge[i]&&!visited[i]&&neighbors.reduce((n,d)=>n+(edge[i+d]||0),0)<=1)walk(i);
      for(let i=0;i<count;i++)if(edge[i]&&!visited[i])walk(i);
      if(ranked.length>best.length)best=ranked;
      if(best.length>=minPaths)break;
    }
    return best.sort((a,b)=>b.score-a.score).slice(0,maxPaths).map(item=>item.path);
  }
  // Focus of the picture from its line art: the densest neighbourhood of strokes, pulled
  // toward the middle of the drawing. Coordinates are in the 1280×720 frame.
  function focusPoint(contours){
    const gx=32,gy=18,cell=40,grid=new Float32Array(gx*gy);
    let minX=1280,minY=720,maxX=0,maxY=0,total=0;
    for(const path of contours||[])for(const [x,y] of path){
      grid[Math.min(gx-1,Math.max(0,Math.floor(x/cell)))+Math.min(gy-1,Math.max(0,Math.floor(y/cell)))*gx]++;
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);total++;
    }
    if(!total)return [640,360];
    const bx=(minX+maxX)/2,by=(minY+maxY)/2,bw=Math.max(80,maxX-minX),bh=Math.max(80,maxY-minY);
    let best=-1,bestCell=0;
    for(let cy=0;cy<gy;cy++)for(let cx=0;cx<gx;cx++){
      let sum=0;
      for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
        const x=cx+dx,y=cy+dy;if(x>=0&&x<gx&&y>=0&&y<gy)sum+=grid[x+y*gx]*(dx*dx+dy*dy<=2?1:.5);
      }
      const px=(cx+.5)*cell,py=(cy+.5)*cell;
      const prior=Math.exp(-(((px-bx)/(.5*bw))**2+((py-by)/(.5*bh))**2));
      const score=sum*(.35+.65*prior);
      if(score>best){best=score;bestCell=cx+cy*gx;}
    }
    const fx=((bestCell%gx)+.5)*cell*.75+bx*.25,fy=(Math.floor(bestCell/gx)+.5)*cell*.75+by*.25;
    return [Math.round(Math.max(minX+.15*bw,Math.min(maxX-.15*bw,fx))),Math.round(Math.max(minY+.15*bh,Math.min(maxY-.15*bh,fy)))];
  }
  // Two accent colours from the picture itself: the dominant saturated hue tints the
  // line art, and the strongest hue at least 60° away lights the drawing front. With a
  // focus (1280×720 frame) colours near the subject count more than the background.
  function palette(rgba, width, height, {bounds=[0,0,width,height],focus=null}={}) {
    const bins=new Float64Array(36),[x0,y0,x1,y1]=bounds;
    const fx=focus?focus[0]*width/1280:0,fy=focus?focus[1]*height/720:0,spread=.2*Math.hypot(x1-x0,y1-y0);
    for(let y=y0;y<y1;y+=2)for(let x=x0;x<x1;x+=2){
      const i=(y*width+x)*4,r=rgba[i]/255,g=rgba[i+1]/255,b=rgba[i+2]/255;
      const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
      if(max<.25||delta<.12)continue;
      let hue=max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4;
      hue=(hue*60+360)%360;
      const near=focus?.1+.9*Math.exp(-((x-fx)**2+(y-fy)**2)/(spread*spread)):1;
      bins[Math.floor(hue/10)%36]+=delta*max*near; // vivid, bright, subject colours outweigh dull background
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
  if(typeof module!=='undefined') {module.exports={vectorize,palette,focusPoint};return;}
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
    if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw new Error('请选择 PNG、JPEG、WebP 或 GIF 图片。'); // GIF here uses its first frame
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
      return {artwork:image,contours,palette:palette(pixels,640,360,{focus:focusPoint(contours)})};
    }catch(error){throw new Error(error.message||'图片无法读取，请换一张图片。');}
    finally{URL.revokeObjectURL(url);}
  }
  scope.imageSettings={load:()=>database('read'),save:images=>database('write',images),importImage,focusPoint};
})(typeof window==='undefined'?{}:window);
