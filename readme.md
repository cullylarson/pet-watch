# pet-watch

> Watches the cats on a local humane society webpage, looking for new cats.

## Usage

```
node check.js \
    --savedDataPath ./trash/data.json \
    --url "http://example.com" \
    --emailFrom "no-reply@example.com" \
    --emailTo "test@example.com, test2@example.com"
```

## SMS Notifications

SMS notifications are sent using Twilio. If you want to send SMS text notifications, create a JSON file like this and fill in the values:

```json
{
    "accountSid": "",
    "authToken": ""
}
```

Then provide the file and phone numbers like this:

```
node check.js \
    --savedDataPath ./trash/data.json \
    --url "http://example.com" \
    --twilio "/path/to/your/twilio.json" \
    --smsTo "+15551230000, +15552341111" \
    --smsFrom "+15554440000"
```


## Testing

This command will load data from a local html file:

```
node check.js \
    --savedDataPath ./trash/data.json \
    --url test1 \
    --emailFrom "no-reply@example.com" \
    --emailTo "test@example.com"
```

Then to show a new cat:

```
node check.js \
    --savedDataPath ./trash/data.json \
    --url test2 \
    --emailFrom "no-reply@example.com" \
    --emailTo "test@example.com"
```
