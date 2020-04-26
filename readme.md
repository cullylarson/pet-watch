# pet-watch

> Watches the cats on a local humane society webpage, looking for new cats.

## Usage

```
node check.js ./trash/data.json http://example.com no-reply@example.com test@example.com
```

## Testing

This command will load data from a local html file:

```
node check.js ./trash/data.json test1 no-reply@example.com test@example.com
```

Then to show a new cat:

```
node check.js ./trash/data.json test2 no-reply@example.com test@example.com
```
