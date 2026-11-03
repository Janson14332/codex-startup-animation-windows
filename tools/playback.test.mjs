import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('图片模式不加载视频，完整播放线稿、渐亮和收尾',async()=>{
  const nodes=new Map(),frames=[];let videoPlays=0,strokes=0;
  const context={clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){strokes++;}};
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
  assert.equal(select('#timeline').max,'10.337');
  assert.match(select('#clip-duration').textContent,/图片.*5.0 秒/);
  for(const t of [650,3000,3250,5550,10337]){
    const next=frames.shift();assert.equal(typeof next,'function');next(t);
  }
  assert.ok(strokes>0);
  assert.equal(videoPlays,0);assert.equal(video.src,undefined);
  assert.equal(select('.window').dataset.completed,'true');
  assert.equal(select('.artwork').src,'picture.png');
});
