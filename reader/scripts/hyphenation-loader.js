
if(window.Hyphenopoly?.config){
 window.Hyphenopoly.config({
  require:{"el-polyton":"FORCEHYPHENOPOLY","el-monoton":"FORCEHYPHENOPOLY"},
  paths:{maindir:"./vendor/hyphenopoly/6.1.0/",patterndir:"./vendor/hyphenopoly/6.1.0/patterns/"},
  setup:{keepAlive:true,normalize:true,selectors:{".pdl-hyphen-probe":{hyphen:"\u00AD",leftmin:3,rightmin:3,minWordLength:6}}}
 });
}
