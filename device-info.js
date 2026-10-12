(function(root){
  'use strict';
  const l10n=(s,...values)=>{const t=v=>typeof I18n==='undefined'?v:I18n.t(v);return Array.isArray(s)?s.reduce((out,part,i)=>out+t(part)+(i<values.length?values[i]:''),''):t(s);};
  const manufacturers = /* MANUFACTURERS */ {"1":"Garmin","2":"Garmin (ANT-FS)","3":"Zephyr","4":"Dayton","5":"Idt","6":"SRM","7":"Quarq","8":"iBike","9":"Saris","10":"Spark Hk","11":"Tanita","12":"Echowell","13":"Dynastream OEM","14":"Nautilus","15":"Dynastream","16":"Timex","17":"Metrigear","18":"Xelic","19":"Beurer","20":"Cardiosport","21":"A&D","22":"HMM","23":"Suunto","24":"Thita Elektronik","25":"Gpulse","26":"Clean Mobile","27":"Pedal Brain","28":"Peaksware","29":"Saxonar","30":"LeMond Fitness","31":"Dexcom","32":"Wahoo","33":"Octane Fitness","34":"Archinoetics","35":"The Hurt Box","36":"Citizen Systems","37":"Magellan","38":"o-synce","39":"Holux","40":"Concept2","41":"Shimano","42":"One Giant Leap","43":"Ace Sensor","44":"Brim Brothers","45":"Xplova","46":"Perception Digital","47":"bf1systems","48":"Pioneer","49":"Spantec","50":"Metalogics","51":"4iiii","52":"Seiko Epson","53":"Seiko Epson OEM","54":"Ifor Powell","55":"Maxwell Guider","56":"Star Trac","57":"Breakaway","58":"Alatech Technology Ltd","59":"Mio Technology Europe","60":"ROTOR","61":"Geonaute","62":"Id Bike","63":"Specialized","64":"Wtek","65":"Physical Enterprises","66":"North Pole Engineering","67":"BKOOL","68":"CatEye","69":"Stages Cycling","70":"SIGMA SPORT","71":"TomTom","72":"Peripedal","73":"Wattbike","76":"Moxy","77":"Ciclosport","78":"Powerbahn","79":"Acorn Projects Aps","80":"Lifebeam","81":"Bontrager","82":"Wellgo","83":"Scosche","84":"MAGURA","85":"Woodway","86":"Elite","87":"Nielsen Kellerman","88":"Dk City","89":"Tacx","90":"Direction Technology","91":"Magtonic","92":"1PartCarbon","93":"Inside Ride Technologies","94":"Sound Of Motion","95":"Stryd","96":"ICG","97":"MiPulse","98":"Bsx Athletics","99":"LOOK","100":"Campagnolo","101":"Body Bike Smart","102":"Praxis Works","103":"Limits Technology","104":"Topaction Technology","105":"cosinuss","106":"Fitcare","107":"Magene","108":"Giant","109":"Tigra Sport","110":"Salutron","111":"Technogym","112":"Bryton Sensors","113":"Latitude Limited","114":"Soaring Technology","115":"iGPSPORT","116":"ThinkRider","117":"Gopher Sport","118":"Waterrower","119":"Orangetheory","120":"INPEAK","121":"Kinetic","122":"Johnson Health Tech","123":"Polar","124":"See.Sense","125":"Nci Technology","126":"IQsquare","127":"LEOMO","128":"iFIT","129":"COROS","130":"Versa Design","131":"Chileaf","132":"CYCPLUS","133":"Gravaa","134":"SIGEYI","135":"COOSPO","136":"GEOID","137":"Bosch","138":"Kyto","139":"Kinetic Sports","140":"Decathlon","141":"TQ Systems","142":"TAG Heuer","143":"Keiser Fitness","144":"Zwift","145":"Porsche Ep","146":"Blackbird","147":"MEILAN","148":"EZON","149":"Laisi","150":"MYZONE","151":"Abawo","152":"Bafang","153":"Luhong Technology","255":"Development","257":"Healthandlife","258":"Lezyne","259":"Scribe Labs","260":"Zwift","261":"Watteam","262":"Recon","263":"Favero","264":"Dynovelo","265":"Strava","266":"Precor","267":"Bryton","268":"SRAM","269":"Navman","270":"COBI","271":"Spivi","272":"Mio Magellan","273":"Evesports","274":"Sensitivus Gauge","275":"Podoon","276":"Life Time Fitness","277":"Falco E Motors","278":"Minoura","279":"Cycliq","280":"Luxottica","281":"TrainerRoad","282":"The Sufferfest","283":"Full Speed Ahead","284":"VirtualTraining","285":"Feedbacksports","286":"OMATA","287":"VDO","288":"Magneticdays","289":"Hammerhead","290":"Kinetic By Kurt","291":"Shapelog","292":"Dabuziduo","293":"JetBlack","294":"COROS","295":"Virtugo","296":"Velosense","297":"Cycligentinc","298":"Trailforks","299":"MAHLE ebikemotion","300":"Nurvv","301":"Microprogram","302":"Zone5cloud","303":"greenTEG","304":"Yamaha Motors","305":"WHOOP","306":"Gravaa","307":"Onelap","308":"MONARK","309":"FORM","310":"Decathlon","311":"Syncros","312":"Heatup","313":"Cannondale","314":"True Fitness","315":"RGT Cycling","316":"Vasa","317":"Race Republic","318":"FAZUA","319":"Oreka Training","320":"LSEC","321":"Lululemon Studio","322":"Shanyue","323":"Spinning Mda","324":"Hilldating","325":"AeroSensor","326":"Nike","327":"Magicshine","328":"Ictrainer","329":"Absolute Cycling","330":"eo SwimBETTER","331":"MyWhoosh","332":"Ravemen","333":"Tektro Racing Products","334":"Darad Innovation Corporation","335":"Cycloptim","337":"Runna","339":"Zepp","340":"Peloton","341":"CARV","342":"Tissot","345":"Real Velo","346":"Wetech","347":"Jespr","348":"Huawei","349":"Gotoes","350":"Cadence App","351":"Una Watch","352":"Tymewear","353":"Exposure Lights","354":"Forto Cycling","5759":"Actigraphcorp"};
  const productModels = /* PRODUCT_MODELS */ {"1:15":"Bike Speed Sensor (gen3)","1:16":"Bike Cadence Sensor (gen3)","1:1036":"Edge 500","1:1169":"Edge 800","1:1325":"Edge 200","1:1561":"Edge 510","1:1567":"Edge 810","1:1736":"Edge Touring / Touring Plus","1:1836":"Edge 1000","1:2067":"Edge 520","1:2147":"Edge 25","1:2161":"Vector 2","1:2162":"Vector 2S","1:2204":"Edge Explore 1000","1:2530":"Edge 820","1:2531":"Edge Explore 820","1:2713":"Edge 1030","1:2787":"Vector 3","1:2909":"Edge 130","1:2924":"Edge 1030 (Asia)","1:3011":"Edge Explore","1:3112":"Edge 520 Plus","1:3121":"Edge 530","1:3122":"Edge 830","1:3192":"Bike Speed Sensor (gen3)","1:3193":"Bike Cadence Sensor (gen3)","1:3299":"HRM-Dual","1:3300":"HRM-Pro","1:3349":"Edge 530 (APAC)","1:3350":"Edge 830 (APAC)","1:3558":"Edge 130 Plus","1:3570":"Edge 1030 Plus","1:3578":"Rally 100/200 series","1:3808":"Varia RCT715","1:3843":"Edge 1040","1:4061":"Edge 540","1:4062":"Edge 840","1:4130":"HRM-Pro Plus","1:4169":"Edge Explore 2","1:4305":"Edge 1040 (Asia)","1:4440":"Edge 1050","1:4446":"HRM-Fit","1:4525":"Rally 110/210 series","1:4606":"HRM 200","1:4633":"Edge 550","1:4634":"Edge 850","1:4655":"Edge MTB"};
  const sources={0:'ANT',1:'ANT+',2:'蓝牙',3:'蓝牙 BLE',4:'Wi-Fi',5:'本机'};
  const antTypes={11:'功率计',17:'训练台 / 健身设备',34:'电子变速',35:'车灯',36:'车灯',40:'骑行雷达',120:'心率传感器',121:'速度 / 踏频传感器',122:'踏频传感器',123:'速度传感器'};
  const bleTypes={0:'连接 GPS',1:'心率传感器',2:'功率计',3:'速度 / 踏频传感器',4:'速度传感器',5:'踏频传感器',6:'步频传感器',7:'训练台'};
  const localTypes={0:'内置 GPS',1:'内置 GLONASS',2:'内置 GPS / GLONASS',3:'加速度计',4:'气压计',5:'温度传感器',10:'内置光学心率',12:'传感器集线器'};
  const batteries={1:'新电池',2:'良好',3:'正常',4:'低电量',5:'极低电量',6:'充电中',7:'未知'};
  const present=v=>typeof v==='number'?Number.isFinite(v):typeof v==='string'&&v.length>0;
  function productModel(manufacturer,product){
    if(!Number.isInteger(manufacturer)||!Number.isInteger(product))return null;
    return productModels[manufacturer+':'+product]??null;
  }
  function modelName(d){
    return d.productName||productModel(d.manufacturer,d.product)||d.descriptor||
      (Number.isFinite(d.product)?l10n('产品编号 ')+d.product:l10n('未提供型号名称'));
  }
  function compatible(a,b){return ['manufacturer','product','serialNumber','sourceType','deviceType','antDeviceNumber'].every(k=>!present(a[k])||!present(b[k])||a[k]===b[k]);}
  function inventory(activity){
    const rows=[];
    const messages=(activity.devices||[]).slice().sort((a,b)=>(a.timestamp??-Infinity)-(b.timestamp??-Infinity));
    for(const message of messages){
      const source=message.sourceId??0;
      let row=rows.slice().reverse().find(r=>r.sourceId===source&&compatible(r,message)&&
        (present(message.deviceIndex)?r.deviceIndex===message.deviceIndex:!present(r.deviceIndex)&&
        ((present(message.serialNumber)&&r.serialNumber===message.serialNumber)||(present(message.antDeviceNumber)&&r.antDeviceNumber===message.antDeviceNumber&&r.sourceType===message.sourceType))));
      if(!row){row={sourceId:source,reportCount:0,batteryReadings:[]};rows.push(row);}
      for(const [k,v]of Object.entries(message))if(present(v))row[k]=v;
      row.reportCount++;
      if(Number.isFinite(message.batteryLevel)&&message.batteryLevel>=0&&message.batteryLevel<=100)row.batteryReadings.push(message.batteryLevel);
    }
    for(const info of activity.fileIds||[]){
      if(!['manufacturer','product','serialNumber','productName'].some(k=>present(info[k])))continue;
      const source=info.sourceId??0;
      let row=rows.find(r=>r.sourceId===source&&r.deviceIndex===0&&compatible(r,info));
      if(!row){row={sourceId:source,deviceIndex:0,reportCount:0,batteryReadings:[],fromFileId:true};rows.unshift(row);}
      for(const [k,v]of Object.entries(info))if(!present(row[k])&&present(v))row[k]=v;
    }
    return rows;
  }
  function kind(d){
    if(d.deviceIndex===0)return l10n('记录设备 / 文件创建者');
    const types=d.sourceType===1?antTypes:d.sourceType===3?bleTypes:d.sourceType===5?localTypes:{};
    return l10n(types[d.deviceType]||(Number.isFinite(d.deviceType)?l10n('设备类型 ')+d.deviceType:l10n('传感器 / 配件')));
  }
  function facts(d){
    const output=[];
    if(present(d.manufacturer))output.push([l10n('厂商'),l10n(manufacturers[d.manufacturer]||l10n('厂商 ID ')+d.manufacturer)]);
    if(present(d.product))output.push([l10n('产品编号'),String(d.product)]);
    if(present(d.descriptor)&&d.descriptor!==d.productName)output.push([l10n('设备描述'),d.descriptor]);
    if(present(d.softwareVersion))output.push([l10n('软件版本'),d.softwareVersion.toFixed(2)]);
    if(present(d.hardwareVersion))output.push([l10n('硬件版本'),String(d.hardwareVersion)]);
    if(present(d.sourceType))output.push([l10n('连接来源'),l10n(sources[d.sourceType]||l10n('来源 ID ')+d.sourceType)]);
    if(d.batteryReadings.length){const first=d.batteryReadings[0],last=d.batteryReadings.at(-1);output.push([l10n('记录中电量'),first===last?last+'%':first+'% → '+last+'%']);}
    if(present(d.batteryStatus))output.push([l10n('电池状态'),l10n(batteries[d.batteryStatus]||l10n('状态 ID ')+d.batteryStatus)]);
    if(present(d.batteryVoltage))output.push([l10n('电池电压'),d.batteryVoltage.toFixed(2)+' V']);
    return output;
  }
  function shareManufacturerInfo(activity){
    const groups=new Map();
    for(const d of inventory(activity).filter(d=>d.deviceIndex===0&&present(d.manufacturer))){if(!groups.has(d.sourceId))groups.set(d.sourceId,[]);groups.get(d.sourceId).push(d);}
    const selected=[];
    for(const [,rows]of [...groups].sort((a,b)=>a[0]-b[0])){const actual=rows.filter(d=>!d.fromFileId);selected.push(...(actual.length?actual:rows));}
    return {names:[...new Set(selected.map(d=>manufacturers[d.manufacturer]||l10n('厂商 ID ')+d.manufacturer))],hasFileCreators:selected.some(d=>d.fromFileId)};
  }
  function shareManufacturers(activity){return shareManufacturerInfo(activity).names;}
  const api={inventory,kind,facts,productModel,modelName,shareManufacturers,shareManufacturerInfo};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DeviceInfo=api;
})(globalThis);
