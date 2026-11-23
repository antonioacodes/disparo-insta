import sprites from './sprites.json';

type Layer={data:number[]};
type OfficeMap={width:number;height:number;layers:Layer[];tilesets:{firstgid:number;name:string}[]};
export async function loadScene(){
  const response=await fetch('/office/office.tmj');
  if(!response.ok)throw Error('Mapa indisponível');
  const map:OfficeMap=await response.json();
  const images:Record<string,HTMLImageElement>={};
  await Promise.all([...map.tilesets.map(s=>s.name),'characters'].map(async name=>{
    const image=new Image();
    image.src='/office/'+name+'.png';
    await image.decode();
    images[name]=image;
  }));
  function tile(ctx:CanvasRenderingContext2D,gid:number,x:number,y:number){
    if(!gid)return;
    const set=map.tilesets.slice().reverse().find(s=>s.firstgid<=gid)!;
    // Keep workstation feet on their tile while giving the desktop more depth.
    const workstation=[1,2,53].includes(gid);
    const seatOrCabinet=[21,69,70].includes(gid);
    const width=workstation?60:seatOrCabinet?54:48;
    const height=workstation?78:seatOrCabinet?72:64;
    ctx.drawImage(images[set.name],(gid-set.firstgid)*48,0,48,64,Math.round(x*32+16-width/2),Math.round(y*32+32-height),width,height);
  }
  function actor(ctx:CanvasRenderingContext2D,id:number,x:number,y:number,dir:string,state:keyof typeof sprites.characters.states,frame:number){
    const [start,length]=sprites.characters.states[state];
    const row=id*4+sprites.characters.directions.indexOf(dir);
    ctx.drawImage(images.characters,(start+frame%length)*64,row*64,64,64,Math.round(x*32)-16,Math.round(y*32)-32,64,64);
  }
  return {map,tile,actor};
}
