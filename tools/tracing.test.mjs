import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pictureBounds} from './media-builder.mjs';
const {vectorize,palette}=createRequire(import.meta.url)('../image-settings.js');

// A square picture letterboxed into 16:9: black bars, a dark-blue field and a pink disc.
function letterboxed(){
  const width=640,height=360,pixels=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,inside=x>=140&&x<500,disc=Math.hypot(x-320,y-180)<90;
    const [r,g,b]=!inside?[0,0,0]:disc?[245,150,190]:[20,34,70];
    pixels.set([r,g,b,255],i);
  }
  return pixels;
}

test('画幅边界换算到 640×360 描边网格',()=>{
  assert.deepEqual(pictureBounds(1000,1000),[140,0,500,360]);
  assert.deepEqual(pictureBounds(1920,1080),[0,0,640,360]);
  assert.deepEqual(pictureBounds(0,0),[0,0,640,360]);
});

test('黑边分界不会变成线稿，主体轮廓保留',()=>{
  const pixels=letterboxed();
  const unbounded=vectorize(pixels,640,360);
  const nearBar=paths=>paths.flat().filter(([x])=>Math.abs(x-280)<=6||Math.abs(x-1000)<=6).length;
  assert.ok(nearBar(unbounded)>0,'without bounds the seam is traced');
  const bounded=vectorize(pixels,640,360,{bounds:pictureBounds(1000,1000)});
  assert.equal(nearBar(bounded),0);
  assert.ok(bounded.length>0);
  const xs=bounded.flat().map(([x])=>x);
  assert.ok(Math.min(...xs)>=440&&Math.max(...xs)<=840,'only the disc outline remains');
});

test('从画面取主色，纯灰画面回退默认色',()=>{
  const colors=palette(letterboxed(),640,360,{bounds:[140,0,500,360]});
  for(const value of Object.values(colors))assert.match(value,/^#[0-9a-f]{6}$/);
  const [r,,b]=[1,3,5].map(i=>parseInt(colors.line.slice(i,i+2),16));
  assert.ok(r>b,'pink disc dominates the line colour');
  const gray=new Uint8Array(64*36*4).fill(128);
  assert.equal(palette(gray,64,36).line,'#d7eaff');
});
