const test = require("node:test");
const assert = require("node:assert/strict");

process.env.MONGODB_URI = "placeholder<test>";
process.env.ADMIN_KEY = "test-admin-key";

const { validateBooking, validateInquiry, validateMenuItem } = require("../server");

test("accepts a valid booking", () => {
  const result = validateBooking({
    name: "Aman Kumar",
    phone: "9876543210",
    checkin: "2030-01-10",
    checkout: "2030-01-12",
    guests: "2",
    roomType: "AC Room - Rs 2000"
  });

  assert.equal(result.valid, true);
});

test("rejects a booking with an invalid checkout date", () => {
  const result = validateBooking({
    name: "Aman Kumar",
    phone: "9876543210",
    checkin: "2030-01-12",
    checkout: "2030-01-10",
    guests: "2",
    roomType: "AC Room - Rs 2000"
  });

  assert.equal(result.valid, false);
});

test("validates inquiry and menu payloads", () => {
  assert.equal(validateInquiry({
    name: "Aman Kumar",
    phone: "9876543210",
    email: "aman@example.com",
    message: "Please share room availability for this weekend."
  }).valid, true);

  assert.equal(validateMenuItem({
    name: "Paneer Tikka",
    category: "veg",
    description: "Chargrilled paneer with fresh spices.",
    price: 280
  }).valid, true);
});
