# api
joinmisskey servers' information api forked for Calckey

https://api.calckey.org/instances.json

## Running locally

1. `pnpm i`
2. `bun index.js` or `node index.js`

## Endpoints

Served statically by [sabo-tabby](https://sabo-tabby.queer.software/)

### /instances.json

```
{
    date: Date // The date instances.json was published at.
    stats: {                      //  statistics
        notesCount: Number,       //  Total notes
        usersCount: Number,       //  Total Users
        mau: Number,              //  Total MAUs
        instancesCount: Number,   //  Servers counter
    },
    instancesInfos: [        // Servers Infos (only alives)
        {
            url: String,     //  Hostname e.g. misskey.io
            name: String,    //  Name e.g. すしすきー
            langs: String[], //  Language the API author aqz set manually e.g. ["ja"], ["zh"]
            description: String | Null,  // meta.description
            isAlive: true,   //  must true
            banner: Bool,    //  Banner existance
            background: Bool,//  Background Image existance
            icon: Bool,      //  Icon Image existance
            nodeinfo: Object | null,  //  nodeinfo
            meta: Object | null,      //  result of api/meta

            stats: Object,   //  deprecated (result of api/stats)
        }, ...
    ]

}
```

### /instance-banners/instance.host.{jpeg|webp}
Banner of each servers (lightweighted)

### /instance-backgrounds/instance.host.{jpeg|webp}
Background image (displayed behind the welcome page) (lightweighted)

### /instance-icons/instance.host.{png|webp}
Icon (not favicon) (lightweighted)

### /alives.txt
List of hosts (separated by `\n`) for servers that were able to communicate

### /deads.txt
List of hosts (separated by `\n`) for servers that were unable to communicate

### versions.json
Version list obtained from GitHub
