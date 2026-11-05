/* ============ 資料 ============
   RAW 由四份檔案整理而來（新聞編碼、文獻、學生人數）；事件樹的事件來自「智能障礙重大事件表」。 */
const RAW = /*__DATA__*/;
const fmtN = n => Number(n).toLocaleString('en-US');
const pct = v => Math.round(v*100)+'%';
const decadeOf = y => Math.floor(y/10)*10;

const NEWS = RAW.news;
NEWS.forEach((a,i)=>{ a.i=i; a.y=+a.d.slice(0,4); a.dec=decadeOf(a.y); });
const DECADES=[1960,1970,1980,1990,2000,2010,2020];
const LIT = RAW.lit.map(r=>({y:r[0], d:r[1], t:r[2], r:r[3], at:r[4], dec:decadeOf(r[0])}));
const PEOPLE = RAW.counts;

// 樹的背景：報紙用哪個詞。把新聞分成幾段時間，算每一段有多少比例的新聞用到這個詞
const TERM_BANDS=[['w1','白痴／低能'],['w2','智能不足'],['w3','智障'],['w4','智能障礙']];
const TERM_BINS=[[1960,1969],[1970,1979],[1980,1984],[1985,1989],[1990,1994],[1995,1999],[2000,2004],[2005,2009],[2010,2014],[2015,2019],[2020,2022]];
function buildTermTrends(){
  const out={};
  TERM_BANDS.forEach(([id,name])=>{
    const curve=[];
    TERM_BINS.forEach(([lo,hi],i)=>{
      const A=NEWS.filter(a=>a.y>=lo&&a.y<=hi), v=A.length?A.filter(a=>a.wg.includes(name)).length/A.length:0;
      const mid=(lo+hi+1)/2, y=Math.floor(mid), m=Math.round((mid-y)*12)+1;
      if(i===0) curve.push(['1962-01',v]);
      curve.push([y+'-'+String(m).padStart(2,'0'), v]);
      if(i===TERM_BINS.length-1) curve.push(['2022-12',v]);
    });
    const use=NEWS.filter(a=>a.wg.includes(name));
    let best=null;
    DECADES.forEach(d=>{ const A=NEWS.filter(a=>a.dec===d); const p=A.length?A.filter(a=>a.wg.includes(name)).length/A.length:0; if(!best||p>best.p) best={d,p}; });
    out[id]={name, curve,
      span:'新聞裡出現的年份：'+use[0].y+'–'+use[use.length-1].y,
      desc:NEWS.length+' 篇新聞裡，有 '+use.length+' 篇用到「'+name.replace('／','」或「')+'」（'+pct(use.length/NEWS.length)+'）。比例最高的是 '+best.d+'年代（'+pct(best.p)+'）。\n背景色塊的寬度，是這個詞在四個主要用詞裡占的比例；一篇新聞可能同時用好幾個詞。'};
  });
  return out;
}

const TREE = {
  // 三個分支，各自從樹根長出來；除了顏色，節點的形狀也不同（顏色寫在 style.css 的 --c-iq、--c-ab、--c-law）
  themes:{
    iq:{name:'智力測驗', shape:'circle'},
    ab:{name:'適應行為量表', shape:'square'},
    law:{name:'法規與鑑定', shape:'diamond'}
  },
  // 時間軸的範圍比事件前後各多一段，背景才會比樹大
  axis:[1962,2025],
  trends:buildTermTrends(),
  events:[
    {id:'root', title:'智能障礙', date:'', parents:[], theme:null, trends:[],
     desc:'這棵樹整理 1970 年代到 2024 年，智能障礙在智力測驗、適應行為量表、法規與鑑定三方面的事件。背景是同一段時間報紙新聞使用的名詞。'},

    {id:'q1', title:'WISC-R 修訂完成', date:'1979', parents:['root'], theme:'iq', trends:[],
     desc:'台灣完成魏克斯勒兒童智力量表（WISC-R）的修訂。\n備註：適逢特教興盛，個別智力測驗列為甄選學生的項目之一（陳美芳，1985）。'},
    {id:'q2', title:'WISC-III 出版', date:'1991', parents:['q1'], theme:'iq', trends:[],
     desc:'魏氏兒童智力測驗（WISC-III）第三版出版。'},
    {id:'q3', title:'WISC-IV 英文版出版', date:'2003', parents:['q2'], theme:'iq', trends:[],
     desc:'魏氏兒童智力量表英文第四版（WISC-IV）出版。'},
    {id:'q4', title:'WISC-V 英文版出版', date:'2014', parents:['q3'], theme:'iq', trends:[],
     desc:'魏氏兒童智力量表英文第五版（WISC-V）出版。'},
    {id:'q5', title:'WISC-V 中文版出版', date:'2018-09', parents:['q4'], theme:'iq', trends:[],
     desc:'魏氏兒童智力量表中文第五版（WISC-V）出版。'},

    {id:'b1', title:'引進文蘭社會成熟量表', date:'1970', when:'1970年代', parents:['root'], theme:'ab', trends:[],
     desc:'引進文蘭社會成熟量表。\n備註：未建立國內常模。'},
    {id:'b2', title:'文蘭適應行為量表', date:'1984', parents:['b1'], theme:'ab', trends:[],
     desc:'文蘭社會成熟量表擴展為文蘭適應行為量表（VABS）第一版。'},
    {id:'b5', title:'文蘭中文編譯版出版', date:'2004', parents:['b2'], theme:'ab', trends:[],
     desc:'文蘭第一版中文編譯版出版。'},
    {id:'b3', title:'引進修訂適應行為量表', date:'1986-02', parents:['b1'], theme:'ab', trends:[],
     desc:'引進使用修訂適應行為量表（徐享良，1986）。\n備註：以美國智能不足協會適應行為量表為藍本。'},
    {id:'b4', title:'社會適應表現檢核表', date:'2003', parents:['b3'], theme:'ab', trends:[],
     desc:'社會適應表現檢核表出版（盧台華等，2003）。\n備註：國內第一本以 AAMR 五大領域做分量表依據設計的適應行為量表（社會適應表現檢核表之信效度及其相關因素之研究）。'},

    {id:'l1', title:'福利法明定鑑定工具', date:'1981', parents:['root'], theme:'law', trends:['w2'],
     desc:'殘障福利法施行細則明定智力量表或適應行為量表為鑑定智能不足兒童的工具（張德榮、徐享良，1986）。'},
    {id:'l2', title:'特教法細則分三類', date:'1987-03-25', parents:['l1'], theme:'law', trends:['w2'],
     desc:'特殊教育法施行細則訂立。\n備註：前項智能不足，依個別智力測驗之結果，分為左列三類：\n一、輕度智能不足：個別智力測驗之結果在平均數負三個標準差以上未達平均數負二個標準差。\n二、中度智能不足：個別智力測驗之結果在平均數負四個標準差以上未達平均數負三個標準差。\n三、重度智能不足：個別智力測驗之結果未達平均數負四個標準差。'},
    {id:'l3', title:'福利法改稱智能障礙者', date:'1990-01-12', parents:['l2'], theme:'law', trends:['w2','w4'],
     desc:'殘障福利法第三條將智能不足改稱為智能障礙者。'},
    {id:'l4', title:'第二次特殊學生普查', date:'1990-06', when:'1990年', parents:['l2','b2'], theme:'law', trends:[],
     desc:'第二次特殊學生普查。\n備註：文蘭適應量表發展（簡式，配合普查之需）。'},
    {id:'l5', title:'特教法改稱智能障礙', date:'1997-04-22', parents:['l3'], theme:'law', trends:['w4'],
     desc:'特殊教育法第三條名詞修訂為智能障礙。'},
    {id:'l6', title:'鑑定標準訂立', date:'2002-05-09', parents:['l5'], theme:'law', trends:['w4'],
     desc:'身心障礙及資賦優異學生鑑定標準訂立。\n備註：本法第三條第二項第一款所稱智能障礙，指個人之智能發展較同年齡者明顯遲緩，且在學習及生活適應能力表現上有嚴重困難者；其鑑定標準如下：\n一、心智功能明顯低下或個別智力測驗結果未達平均數負二個標準差。\n二、學生在自我照顧、動作、溝通、社會情緒或學科學習等表現上較同年齡者有顯著困難情形。'},
    {id:'l7', title:'鑑定標準修訂', date:'2012-09-28', parents:['l6'], theme:'law', trends:['w4'],
     desc:'身心障礙及資賦優異學生鑑定標準修訂（第一次針對智能障礙修訂）。\n備註：本法第三條第一款所稱智能障礙，指個人之智能發展較同年齡者明顯遲緩，且在學習及生活適應能力表現上有顯著困難者。\n前項所定智能障礙，其鑑定基準依下列各款規定：\n一、心智功能明顯低下或個別智力測驗結果未達平均數負二個標準差。\n二、學生在生活自理、動作與行動能力、語言與溝通、社會人際與情緒行為等任一向度及學科（領域）學習之表現較同年齡者有顯著困難情形。'},
    {id:'l8', title:'鑑定辦法再修訂', date:'2024-04-29', parents:['l7'], theme:'law', trends:['w4'],
     desc:'特殊教育學生及幼兒鑑定辦法（第二次針對智能障礙修訂）。\n備註：原因說明：智能發展改成心智功能；修正第一項「學習及生活適應能力」為「適應行為及學業學習」（參考國際上評估工具為適應行為量表（adapted behavior），不僅限於生活適應）。\n本法第三條第一款所稱智能障礙，指個人在發展階段，其心智功能、適應行為及學業學習表現，較同年齡者有顯著困難。\n前項所定智能障礙，其鑑定基準依下列各款規定：\n一、心智功能明顯低下或個別智力測驗結果未達平均數負二個標準差。\n二、學生在生活自理、動作與行動能力、語言與溝通、社會人際與情緒行為等任一向度及學科（領域）學習之表現較同年齡者有顯著困難情形。'}
  ]
};
// 樹狀圖上的事件名稱分成兩行寫；只決定在哪裡換行，字沒有改
const TITLE_LINES={
  q1:['WISC-R','修訂完成'], q2:['WISC-III','出版'], q3:['WISC-IV','英文版出版'], q4:['WISC-V','英文版出版'], q5:['WISC-V','中文版出版'],
  b1:['引進文蘭','社會成熟量表'], b2:['文蘭適應','行為量表'], b5:['文蘭中文','編譯版出版'], b3:['引進修訂','適應行為量表'], b4:['社會適應','表現檢核表'],
  l1:['福利法明定','鑑定工具'], l2:['特教法細則','分三類'], l3:['福利法改稱','智能障礙者'], l4:['第二次','特殊學生普查'], l5:['特教法改稱','智能障礙'],
  l6:['鑑定標準訂立'], l7:['鑑定標準修訂'], l8:['鑑定辦法','再修訂']
};
