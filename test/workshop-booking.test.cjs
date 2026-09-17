"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function section(file, start, end) {
  const source = fs.readFileSync(file, "utf8");
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Could not find ${start} in ${file}`);
  return source.slice(from, to);
}

function testTableChoice() {
  const html = section("index.html", "function renderEventBookingTableOptions", "function openEventBooking");
  const label = { firstChild: { textContent: "رقم الطاولة" } };
  const select = { innerHTML: "", disabled: false };
  const context = {
    tablesDB: [], eventBookingsDB: [], esc: String,
    document: { getElementById: id => id === "eventBookingTable" ? select : id === "eventBookingTableLabel" ? label : null }
  };
  vm.runInNewContext(`${html}\nrenderEventBookingTableOptions({id:"workshop",tableCount:30});`, context);
  assert.equal((select.innerHTML.match(/<option/g) || []).length, 1);
  assert.match(select.innerHTML, /value="1" selected/);
  assert.equal(label.firstChild.textContent, "عدد الطاولات");

  vm.runInNewContext(`${html}\nrenderEventBookingTableOptions({id:"candle_day"},Array.from({length:30},(_,i)=>({id:String(i+1),name:String(i+1)})));`, context);
  assert.equal((select.innerHTML.match(/<option/g) || []).length, 30);
  assert.equal(label.firstChild.textContent, "رقم الطاولة");

  const submission = fs.readFileSync("index.html", "utf8");
  assert.match(submission, /\.\.\.\(!isCandle \? \{ tableCount \} : \{\}\)/);
  assert.ok(submission.includes("عدد الطاولات: ${tableCount}"));
}

function testLiveCapacityRefresh() {
  const helpers = section("index.html", "function eventTableCapacity", "function openEventDetails");
  const capacityUi = section("index.html", "function renderEventBookingCapacity", "function refreshWorkshopCapacityUI");
  const refresh = section("index.html", "function refreshWorkshopCapacityUI", "function handleEventBookingSubmit");
  const summary = { innerHTML: "" };
  const submit = { disabled: false, textContent: "تأكيد الحجز" };
  const modal = { classList: { contains: () => true } };
  const context = {
    eventCapacityDB: { workshop: { total: 30, reserved: 18 } },
    eventBookingsDB: [], eventsDB: [{ id: "workshop", tableCount: 30, price: 0 }],
    currentCat: "", activeEventDetailsId: null, currentLang: "ar", esc: String, money: String,
    document: { getElementById: id => id === "eventBookingSummary" ? summary : id === "eventBookingModal" ? modal : id === "eventBookingId" ? { value: "workshop" } : null,
      querySelector: () => submit },
    console
  };
  vm.runInNewContext(`${helpers}\n${capacityUi}\n${refresh}`, context);
  assert.equal(vm.runInNewContext("eventTablesRemaining(eventsDB[0])", context), 12);
  context.eventCapacityDB.workshop.reserved = 27;
  vm.runInNewContext("refreshWorkshopCapacityUI()", context);
  assert.match(summary.innerHTML, />3</);
  assert.equal(submit.disabled, false);
  context.eventCapacityDB.workshop.reserved = 30;
  vm.runInNewContext("refreshWorkshopCapacityUI()", context);
  assert.match(summary.innerHTML, /اكتمل الحجز/);
  assert.equal(submit.disabled, true);
}

async function testAtomicAdminCapacity() {
  const handler = section("admin.html", "async function updateEventBookingStatus", "function restoreEventBookingStatusSelect");
  let data = {
    _capacity: { workshop: { total: 1, reserved: 0 } },
    first: { bookingId: "first", eventId: "workshop", status: "pending" },
    second: { bookingId: "second", eventId: "workshop", status: "pending" }
  };
  let transactionQueue = Promise.resolve();
  const context = {
    eventCanManage: () => true,
    eventBookingsDB: ["first", "second"].map(id => ({ id, eventId: "workshop", status: "pending" })),
    eventsDB: [{ id: "workshop", tableCount: 30 }],
    eventCapacityDB: { workshop: { total: 1, reserved: 0 } },
    normalizeEventBookingStatus: value => String(value || "").toLowerCase(),
    showNotif: () => {}, restoreEventBookingStatusSelect: () => {}, eventBookingStatusErrorMessage: () => "",
    firebase: { database: { ServerValue: { TIMESTAMP: "SERVER_TIMESTAMP" } } }, console,
    db: { ref: () => ({ transaction: update => {
      const operation = transactionQueue.then(() => {
        const next = update(data);
        if (next === undefined) return { committed: false, snapshot: { exists: () => true } };
        data = next;
        return { committed: true, snapshot: { exists: () => true } };
      });
      transactionQueue = operation.catch(() => {});
      return operation;
    } }) }
  };
  vm.runInNewContext(handler, context);
  await Promise.all([context.updateEventBookingStatus("first", "confirmed"), context.updateEventBookingStatus("second", "confirmed")]);
  assert.equal([data.first.status, data.second.status].filter(status => status === "confirmed").length, 1);
  assert.equal(data._capacity.workshop.reserved, 1);

  const confirmedId = data.first.status === "confirmed" ? "first" : "second";
  context.eventBookingsDB = [{ id: confirmedId, eventId: "workshop", status: "confirmed" }];
  await context.updateEventBookingStatus(confirmedId, "confirmed");
  assert.equal(data._capacity.workshop.reserved, 1);

  context.eventBookingsDB = [{ id: confirmedId, eventId: "workshop", status: "confirmed" }];
  await context.updateEventBookingStatus(confirmedId, "cancelled");
  assert.equal(data[confirmedId].status, "cancelled");
  assert.equal(data._capacity.workshop.reserved, 0);

  context.eventBookingsDB = [{ id: confirmedId, eventId: "workshop", status: "cancelled" }];
  await context.updateEventBookingStatus(confirmedId, "cancelled");
  assert.equal(data._capacity.workshop.reserved, 0);
}

async function main() {
  testTableChoice();
  console.log("WORKSHOP_TABLE_CHOICE=PASS");
  testLiveCapacityRefresh();
  console.log("LIVE_CAPACITY_REFRESH_AND_FULL_STATE=PASS");
  await testAtomicAdminCapacity();
  console.log("ATOMIC_CONFIRM_CANCEL_AND_CONCURRENCY=PASS");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
