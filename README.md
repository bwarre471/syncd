
Allows execution of Promises in parallel workers, that can be limited by the count, or have certain limit which resets after time interval, it can be usefull for e.g. parsing megahuge csv into database, or simply downloading something rate limited.

If you remove timeFrame and limitInTimeFrame parameters, it works without rate limits.

It keeps data object that's shared accross callbacks, so you can work in it with some persistent data.

First args function launches, providing argument for worker, then worker launches a promise, which can be rejected or resolve, if you use a promise there, you can wait for it execution to continue in a worker.

You can retry failed promise by simply calling retry there, if retry is called, worker will retry to do a promise forever.

Finish is destructor, so you can quit database connection there.

Foo bar version of usage:

```javascript
const inc = require('syncd_promise_loop')

let loop = syncd({
            infoInterval:       23,
            parallel:           12,
            timeFrame:        3000,
            limitInTimeFrame:    3,
        })

        .args((loop)=>{
            loop.counter++
            // Here we set arguments for the loop.
            return {
                counter: loop.counter,
                number: Math.round(Math.random()*loop.multiplier)
            }
        })

        .main((args, loop)=>{
            // Main working loop, that returns a promise
            console.info(`[ > ] Returning promise...`)
            console.info(`       ${loop.counter}`,)
            return new Promise((resolve, reject)=>{

                setTimeout(()=>{
                        resolve(args.number+1)
                }, Math.floor(Math.random()*1000))

                setTimeout(()=>{
                        reject(false)
                }, Math.floor(Math.random()*1000))
            })
        })

        .then(
            (loop, args)=>{
            return {
            resolved: (resolvedWith, args, worker)=>{
                // Here is the function that is called if Promises resolved.
                console.info(`[ > ] Promise resolved:`)
                console.info(`       with:`,resolvedWith)
                console.info(`       args:`,args)
                console.info()
                worker.continueAfterResolving(new Promise((resolve)=>{
                    setTimeout(()=>{
                        console.info(`There it is... ${args.counter}:`, args.number)
                        resolve(`resolving`)

                    },3000)
                }))
            },

            rejected: (rejectedWith, args, retry, worker)=>{
                // Here is the function that is called if Promises resolved.
                retry()
                console.info(`[ > ] Promise rejected:`)
                console.info(`       with:`,rejectedWith)
                console.info(`       args:`,args)
            }
            }})

        .info((data, loop)=>{
            loop.parameters.infoInterval
            console.info(`[ > ] Info triggered`)
        })

        .until((loop)=>{
            // If true, we no longer stay in loop
            console.info(`[ > ] Until loop triggered`)
            return loop.counter >= 30
        })

        .finish((loop)=>{
            // This gets called, after all workers are resolved
            console.info(`[ > ] Loop is done.`)
        })

    loop.start({
        multiplier: 100,
        counter: 0,
    })

    setTimeout((x)=>{
        console.info(`[ > ] Pausing...`)
        loop.pause()
    }, 5*1000)

    setTimeout((x)=>{
        console.info(`[ > ] Resuming...`)
        loop.resume()
    }, 23*1000)

    console.info(loop)
```
