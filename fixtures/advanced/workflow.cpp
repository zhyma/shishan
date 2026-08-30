// @shishan function sync-record
// @summary Load and asynchronously save one record
Task syncRecord(Client& client) {
  // @shishan call load-record
  // @summary Ask the client for the current record
  // @target client.load
  auto record = client.load();

  // @shishan error protect-save
  // @summary Let callers observe a failed asynchronous save
  // @failure the client rejects the save
  try {
    // @shishan async await-save
    // @summary Suspend until the client persists the record
    // @target client.save
    // @resume continue with the saved record
    auto saved = co_await client.save(record);
    co_return saved;
  } catch (...) {
    throw;
  }
}
