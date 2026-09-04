import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const root=new URL("../",import.meta.url);
const read=(path)=>readFile(new URL(path,root),"utf8");

test("portrait kiosk keeps the product surface and uses the recovered flow",async()=>{
 const [tsx,css]=await Promise.all([read("app/components/KioskApp.tsx"),read("app/globals.css")]);
 for(const category of ["진공세트","프리미엄","LA갈비","뼈세트","O'meat"])assert.match(tsx,new RegExp(category.replace("'","\\'")));
 for(const step of ["products","cart","fulfillment","pickup-info","pickup-date","pickup-time","shipping-sender","shipping-recipient","shipping-address","shipping-date","payment","done"])assert.match(tsx,new RegExp('"'+step+'"'));
 assert.doesNotMatch(tsx,/"onsite-info"/);
 assert.match(tsx,/AnimatePresence/);
 assert.match(tsx,/product-modal/);
 assert.match(tsx,/idempotencyKey/);
 assert.match(css,/grid-template-columns:repeat\(2/);
 assert.match(css,/position:fixed/);
});

test("Step2 is text-only and pickup scheduling uses calendar plus 30-minute slots",async()=>{
 const [tsx,flowCss]=await Promise.all([read("app/components/KioskApp.tsx"),read("app/kiosk-flow.css")]);
 const fulfillment=tsx.slice(tsx.indexOf("function Fulfillment"),tsx.indexOf("function InfoStep"));
 assert.doesNotMatch(fulfillment,/⌂|▣|<i>|<span>/);
 assert.match(fulfillment,/fulfillment-customer-options/);
 assert.match(fulfillment,/onsite-sale-zone/);
 assert.match(flowCss,/font:800 34px/);
 assert.match(tsx,/function Calendar/);
 assert.match(tsx,/pickupTimes=Array\.from\(\{length:27\}/);
 assert.match(tsx,/8\*60\+index\*30/);
 assert.match(tsx,/pickup-date/);
 assert.match(tsx,/pickup-time/);
 assert.match(flowCss,/pickup-time-grid\{display:grid;grid-template-columns:repeat\(2/);
});

test("shipping stores separated Kakao address fields and requires a shipping date",async()=>{
 const [tsx,api,types]=await Promise.all([read("app/components/KioskApp.tsx"),read("app/api/orders/route.ts"),read("app/components/types.ts")]);
 for(const field of ["roadAddr","roadAddrReference","jibunAddr","postalCode","detailAddr","shipDate"])assert.match(types,new RegExp(field));
 assert.match(tsx,/postcode\.v2\.js/);
 assert.match(tsx,/data\.zonecode/);
 assert.match(tsx,/data\.roadAddress/);
 assert.match(tsx,/data\.jibunAddress/);
 assert.match(tsx,/주소를 직접 입력할게요/);
 assert.match(tsx,/직접 입력한 주소입니다/);
 assert.doesNotMatch(tsx,/정일동/);
 assert.match(api,/payload\.shipDate/);
 assert.match(api,/ship_date/);
 assert.match(api,/발송 예정/);
});

test("operator APIs require one passcode session and create an atomic D1 fulfillment",async()=>{
 const [orders,workItems,session]=await Promise.all([read("app/api/orders/route.ts"),read("app/api/work-items/route.ts"),read("app/lib/operator-session.ts")]);
 for(const source of [orders,workItems])assert.match(source,/requireOperatorApi/);
 assert.match(session,/PBKDF2/);
 assert.match(session,/iterations:\s*100000/);
 assert.match(orders,/idempotency_key/);
 assert.match(orders,/runtimeEnv\.DB\.batch/);
 assert.match(orders,/INSERT INTO fulfillments/);
 assert.match(orders,/INSERT INTO fulfillment_items/);
 assert.match(workItems,/expectedVersion/);
 assert.match(workItems,/version=version\+1/);
});

test("workshop surface is task-first and free of static customer alerts",async()=>{
 const workshop=await read("app/components/WorkshopApp.tsx");
 assert.doesNotMatch(workshop,/김철수|주문변경 <em>2|라벨조치 <em>1/);
 assert.match(workshop,/customerArrived/);
});

test("database migrations include safeguards and the new fulfillment tables",async()=>{
 const [d1,fulfillment]=await Promise.all([read("drizzle/0000_charming_bishop.sql"),read("drizzle/0002_deep_giant_girl.sql")]);
 assert.match(d1,/orders_no_hard_delete/);
 assert.match(d1,/idx_orders_idempotency/);
 assert.match(fulfillment,/CREATE TABLE `fulfillments`/);
 assert.match(fulfillment,/CREATE TABLE `fulfillment_items`/);
 assert.match(fulfillment,/idx_fulfillments_pickup_at/);
 assert.match(fulfillment,/idx_fulfillments_ship_date/);
});

test("customer info validation remains actionable",async()=>{
 const tsx=await read("app/components/KioskApp.tsx");
 assert.match(tsx,/flow-back-bottom/);
 assert.match(tsx,/aria-label="이전 단계"/);
 assert.match(tsx,/buyerName\.trim\(\)\.length>0/);
 assert.match(tsx,/attempted&&!phoneValid/);
 assert.doesNotMatch(tsx,/InfoStep[\s\S]{0,2500}disabled=\{!valid\}/);
});

test("category rail uses Korean-first hierarchy",async()=>{
 const [tsx,css]=await Promise.all([read("app/components/KioskApp.tsx"),read("app/globals.css")]);
 for(const assist of ["VACUUM","PREMIUM","LA"])assert.match(tsx,new RegExp(assist));
 assert.match(tsx,/category-name/);
 assert.match(tsx,/category-assist/);
 assert.match(css,/button\.single \.category-name/);
 assert.doesNotMatch(tsx,/🦴|category-symbol/);
});

test("custom order and settings workflows stay durable",async()=>{
 const [kiosk,nav,custom,settings,settingsApi,d1]=await Promise.all([read("app/components/KioskApp.tsx"),read("app/components/AppNav.tsx"),read("app/components/CustomOrderApp.tsx"),read("app/components/SettingsApp.tsx"),read("app/api/settings/route.ts"),read("drizzle/0001_confused_swarm.sql")]);
 for(const route of ["/sales","/workshop","/settings"])assert.match(nav,new RegExp(route.replaceAll("/","\\/")));
 assert.match(kiosk,/\/kiosk\/custom/);
 assert.match(kiosk,/category-name omeat/);
 assert.match(custom,/idempotencyKey/);
 assert.match(settings,/제품 사진 URL/);
 assert.match(settingsApi,/requireOperatorApi/);
 assert.match(settingsApi,/configuration_events/);
 assert.match(d1,/custom_orders_no_hard_delete/);
});

test("all operating surfaces share navigation and sales has an alias route",async()=>{
 const [nav,kiosk,salesApp,workshop,settings,css,sales]=await Promise.all([read("app/components/AppNav.tsx"),read("app/components/KioskApp.tsx"),read("app/components/SalesApp.tsx"),read("app/components/WorkshopApp.tsx"),read("app/components/SettingsApp.tsx"),read("app/globals.css"),read("app/sales/page.tsx")]);
 for(const href of ["/kiosk","/sales","/workshop","/settings"])assert.match(nav,new RegExp('href: "'+href.replaceAll("/","\\/")+'"'));
 assert.match(nav,/aria-current/);
 assert.match(kiosk,/AppNav current="kiosk"/);
 assert.match(salesApp,/AppNav current="sales"/);
 assert.match(workshop,/AppNav current="workshop"/);
 assert.match(settings,/AppNav current="settings"/);
 assert.match(sales,/SalesApp/);
 assert.match(css,/\.category-rail\{[^}]*position:sticky;top:92px;height:calc\(100vh - 92px\)/);
 assert.match(css,/\.app-nav\{[^}]*position:fixed;[^}]*right:14px;[^}]*flex-direction:column/);
 assert.match(css,/@media\(max-width:1180px\)\{\.app-nav\{[^}]*bottom:14px;[^}]*flex-direction:row/);
});

test("sales and workshop refetch within three seconds and recover on focus and online",async()=>{
 const [sales,workshop,client]=await Promise.all([read("app/components/SalesApp.tsx"),read("app/components/WorkshopApp.tsx"),read("app/lib/orders-client.ts")]);
 for(const source of [sales,workshop]){
  assert.match(source,/setInterval\([\s\S]{0,100}2500\)/);
  assert.match(source,/addEventListener\("focus"/);
  assert.match(source,/addEventListener\("online"/);
 }
 assert.match(sales,/지금 새로고침/);
 assert.match(sales,/selectedDate/);
 assert.match(client,/date/);
});

test("custom order validates, preserves, and joins the main kiosk order",async()=>{
 const [custom,kiosk,ordersApi]=await Promise.all([read("app/components/CustomOrderApp.tsx"),read("app/components/KioskApp.tsx"),read("app/api/orders/route.ts")]);
 assert.match(custom,/onSubmit=\{complete\}/);
 assert.match(custom,/orderDraft\.customItem/);
 assert.match(custom,/customStorageKey/);
 assert.match(custom,/sessionStorage\.setItem/);
 assert.match(custom,/맞춤주문은 20만원부터 가능합니다/);
 assert.match(custom,/type="submit"/);
 assert.match(kiosk,/custom-review-item/);
 assert.match(custom,/\/kiosk\?resume=cart/);
 assert.match(kiosk,/draftHydrated&&step!=="done"/);
 assert.match(ordersApi,/order_item_customizations/);
});

test("sales date views exclude cancelled orders while search keeps history",async()=>{
 const [admin,ordersApi,queries]=await Promise.all([read("app/components/SalesApp.tsx"),read("app/api/orders/route.ts"),read("app/lib/sales-order-query.ts")]);
 assert.match(admin,/order\.status !== "cancelled"/);
 assert.match(queries,/o\.order_status!='cancelled'/);
 assert.match(ordersApi,/else if \(q\)[\s\S]*SALES_SEARCH_ORDERS_SQL/);
});

test("P0 sales APIs require the shared session and disable response caches",async()=>{
 const [orders,workItems,fulfillment,settings,client]=await Promise.all([read("app/api/orders/route.ts"),read("app/api/work-items/route.ts"),read("app/api/orders/fulfillment/route.ts"),read("app/api/settings/route.ts"),read("app/lib/orders-client.ts")]);
 for(const source of [orders,workItems,fulfillment,settings]){
  assert.match(source,/requireOperatorApi/);
 }
 assert.match(client,/cache:"no-store"/);
 assert.match(orders,/no-store, no-cache, must-revalidate/);
 const queries=await read("app/lib/sales-order-query.ts");
 assert.match(queries,/f\.fulfillment_type='pickup'/);
 assert.match(queries,/f\.ship_date=\?/);
 assert.match(queries,/ORDER BY o\.created_at DESC/);
});

test("kiosk brand logo and editable headline use durable audited settings",async()=>{
 const [kiosk,sales,workshop,settings,settingsApi,productsApi,css,logo,appSettings]=await Promise.all([
  read("app/components/KioskApp.tsx"),read("app/components/SalesApp.tsx"),read("app/components/WorkshopApp.tsx"),read("app/components/SettingsApp.tsx"),read("app/api/settings/route.ts"),read("app/api/products/route.ts"),read("app/globals.css"),readFile(new URL("public/jeongilpum-logo.png",root)),import("../app/lib/app-settings.ts")
 ]);
 assert.match(kiosk,/정일품 정육식당/);
 assert.match(kiosk,/src="\/jeongilpum-logo\.png"/);
 assert.doesNotMatch(kiosk,/명절 선물세트|2026 추석 예약/);
 assert.match(sales,/className="operations-brand-logo" src="\/jeongilpum-logo\.png"/);
 assert.match(workshop,/className="operations-brand-logo" src="\/jeongilpum-logo\.png"/);
 assert.match(kiosk,/\{headline\}/);
 assert.match(settings,/KIOSK MESSAGE/);
 assert.match(settings,/type:"app_setting"/);
 assert.match(settingsApi,/entity_type='app_setting'/);
 assert.match(settingsApi,/INSERT INTO configuration_events[\s\S]*SELECT/);
 assert.match(settingsApi,/COALESCE\(\(SELECT id/);
 assert.doesNotMatch(settingsApi,/CREATE TABLE|ALTER TABLE/);
 assert.match(productsApi,/appSettings:[\s\S]*kioskHeadline/);
 assert.match(css,/\.kiosk-brand-logo/);
 assert.deepEqual([...logo.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 assert.equal(appSettings.parseStoredSetting('{"value":" 새 문구 "}',appSettings.DEFAULT_KIOSK_HEADLINE),"새 문구");
 assert.equal(appSettings.parseStoredSetting('broken',appSettings.DEFAULT_KIOSK_HEADLINE),"좋은 선물을 골라주세요");
});
