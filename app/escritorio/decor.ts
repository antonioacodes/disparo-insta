// Original 16 × 16 pixel furniture tiles. Transparent pixels reveal the room floor.
const designs:Record<string,string[]> = {
  A:[' ................ ',' dddddddddddddd ',' dwwwwwwwwwwwwd ',' dwwiiwwwwwwwwd ',' dwwooiwwwwwwwd ',' dwwwwwwiowwwwd ',' dwgwwwwoowwgwd ',' dwggwwwwwwggwd ',' dyyyyyyyyyyyyd ',' dddddddddddddd ','  bbbbbbbbbbbb  ','  bcccccchhhhb  ','  bcccccchhhhb  ','  bbbbbbbbbbbb  '],
  S:['                ',' dddddddddddddd ',' dccccccccccccd ',' dcmmmmmcmmmmmd ',' dcmmmmmcmmmmmd ',' dccccccccccccd ',' dmmmmmmcmmmmmd ',' dhhhhhhhhhhhhd ',' cchhhhhhhhhhcc ',' cchhhhhhhhhhcc ',' dccccccccccccd ','  dd        dd  '],
  M:['    cccc cccc   ','    chhc chhc   ','  dddddddddddd  ','  byyyyyyyyyyb  ','  byyppyyyyyyb  ','  byyppyywyyyb  ','  byyyyyyyyyyb  ','  bbbbbbbbbbbb  ','   dd      dd   ','    chhc chhc   ','    cccc cccc   '],
  V:['   dddddddddd   ','   dhhhhhhhhd   ','   dwiiiwwwwd   ','   dwwwwwwwwd   ','   dddddddddd   ','   dbbppbbogd   ','   dbbppbbddd   ','   dbbppbbddd   ','   dyyyyyyyyd   ','   dccccccccd   ','   dddddddddd   '],
  X:[' dddddd dddddd  ',' dwwwwd dwwiwd  ',' dwiwwd diwuwd  ',' ddddd ddddddd  ','   dd     dd    ',' byyyyyyyyyyyyb ',' byppppppyypyyb ',' byyyyyyyyyyyyb ',' bbbbbbbbbbbbbb ','  dd        dd  ']
};
const colors:Record<string,string>={d:'#343847',b:'#735346',c:'#b87763',h:'#d59884',m:'#ecb9a0',w:'#56a6ba',i:'#aeede3',o:'#f6b552',g:'#558761',y:'#ddb585',p:'#f7e7c9',u:'#8667c0'};
export function furniture(ctx:CanvasRenderingContext2D,tile:string,x:number,y:number){
  designs[tile]?.forEach((row,j)=>Array.from(row.trimEnd()).forEach((pixel,i)=>{
    if(colors[pixel]){ctx.fillStyle=colors[pixel];ctx.fillRect(x+i*2,y+j*2,2,2)}
  }));
}
