# Game Panel PRO screenshots

Actual application components with demonstration data. Addresses, player names, counts and logs are examples.

## Server fleet

![Server list with game response, maps, players and resource usage](screenshots/fleet-dark.png)

[Light theme](screenshots/fleet-light.png) · [Cards](screenshots/fleet-cards.png) · [Mobile](screenshots/fleet-mobile.png)

## Console

![Console with game logs, status and resource metrics](screenshots/console-dark.png)

## Configuration forms

![Structured server configuration](screenshots/configuration-form.png)

## Online players

![Player roster with score and connection time](screenshots/online-players.png)

## Nodes

![Online runtime nodes](screenshots/nodes.png)

## Network allocations

![Configured addresses and TCP/UDP port ranges](screenshots/network-allocations.png)

## Additional IP addresses

![Persistent interfaces and the IP/MAC form](screenshots/additional-ip.png)

## Reproduce

Build the backend, start the frontend Vite server on `127.0.0.1:4178`, then run:

```sh
node scripts/capture-documentation.mjs
node scripts/capture-workspaces.mjs
```

The scripts use local browser fixtures and intercept API requests; they do not connect to production.
