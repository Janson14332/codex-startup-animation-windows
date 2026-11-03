import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('图片模式不加载视频，完整播放线稿、图片在线稿下亮起和收尾',async()=>{
  const nodes=new Map(),frames=[];let videoPlays=0,strokes=0;
  const context={clearRect(){},setTransform(){},beginPath(){},moveTo(){},lineTo(){},stroke(){strokes++;}};
  function node(){return {style:{},dataset:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},appendChild(){},querySelectorAll(){return [];},getContext(){return context;},decode:async()=>{},open:false};}
  const select=key=>{if(!nodes.has(key))nodes.set(key,node());return nodes.get(key);};
  const video=select('.reveal-video');
  Object.assign(video,{paused:true,readyState:0,pause(){this.paused=true;},play(){videoPlays++;return Promise.resolve();}});
  const document={body:node(),hidden:false,querySelector:select,querySelectorAll:()=>[node(),node()],createElement:node,addEventListener(){}};
  const window={AEMEATH_MEDIA:{type:'image',id:'image-test',durationMs:5000},AEMEATH_ASSETS:{artwork:'picture.png',reveal:null},
    CONTOUR_PATHS:[[[0,0],[200,0],[200,100]]],matchMedia:()=>({matches:false}),addEventListener(){},
    imageSettings:{load:async()=>({}),save:async()=>{}}};
  window.parent=window;
  class Path2D{moveTo(){}lineTo(){}}
  vm.runInNewContext(await readFile(new URL('../animation.js',import.meta.url),'utf8'),{
    window,document,location:{search:''},performance:{now:()=>0},Path2D,URLSearchParams,
    requestAnimationFrame:callback=>{frames.push(callback);return frames.length;},cancelAnimationFrame(){},setTimeout,clearTimeout,
  });
  await new Promise(setImmediate);
  // 2.5 s of line art before the picture, 5 s configured brightening, 0.7 s settle.
  assert.equal(select('#timeline').max,'8.2');
  assert.match(select('#clip-duration').textContent,/图片.*5.0 秒/);
  const stages=[];
  for(const t of [650,2400,3300,6000,8200]){
    const next=frames.shift();assert.equal(typeof next,'function');next(t);stages.push(select('.window').dataset.stage);
  }
  assert.deepEqual(stages.slice(0,3),['drawing','drawing','dispersing']);
  // The picture is already visible and reasonably bright while the strokes dissolve.
  assert.ok(Number(select('.artwork').style.opacity)>.9);
  assert.ok(strokes>0);
  assert.equal(videoPlays,0);assert.equal(video.src,undefined);
  assert.equal(select('.window').dataset.completed,'true');
  assert.equal(select('.artwork').src,'picture.png');
});
