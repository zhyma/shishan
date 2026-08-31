// @shishan function sync-record
// @summary Load and asynchronously save one typed record
export async function syncRecord(client: Client): Promise<Record> {
  // @shishan call load-record
  // @summary Ask the client for the current record
  // @target client.load
  const record = client.load();

  // @shishan error protect-save
  // @summary Preserve the error boundary around persistence
  // @failure the client rejects the save
  try {
    // @shishan async await-save
    // @summary Wait for the client to persist the record
    // @target client.save
    // @resume continue with the saved record
    return await client.save(record);
  } catch (error) {
    throw new Error('record save failed', { cause: error });
  }
}
