# @shishan function sync-record
# @summary Load, validate, and asynchronously save one record
async def sync_record(client):
    # @shishan call load-record
    # @summary Ask the client for the current record
    # @target client.load
    record = client.load()

    # @shishan error protect-save
    # @summary Translate save failures into a domain error
    # @failure the client rejects the save
    try:
        # @shishan async await-save
        # @summary Wait for the client to persist the record
        # @target client.save
        # @resume continue with the saved record
        saved = await client.save(record)
    except RuntimeError as error:
        raise ValueError("record save failed") from error

    return saved
