await addTransaction({
  id: String(Date.now()),
  type: "send",
  amount: amount,
  phone: phone,
  country: country,
  provider: provider,
  status: "pending", // later you can set to "paid" when webhook confirms
  createdAt: Date.now(),
});
