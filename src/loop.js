class syncdPromiseWorker {
    constructor(loop, id, work, then) {
        this.loop = loop
        this.id = id
        this.hasArgs = false
        this.setWork(work)
        this.setThen(then)
        this.good = true 
        this.markForRetry = false
        this._continueAfterResolving = []
    }
    setWork(work) {
        this._work = work
        return this
    }
    setArgs(args) {
        this._args = args
        return this
    }
    makeArgs() {
        this.hasArgs = true
        this.__args = this._args(this.loop.data)
        return this
    }
    setThen(then) {
        this.__then = then
        return this
    }
    mustEndToFinish(promises) {
        if(!(promises instanceof Array)) {
            promises = [promises]
        }
        this.loop.mustEnd(promises)
    }
    continueAfterResolving(promises) {
        if(!(promises instanceof Array)) {
            promises = [promises]
        }
        this._continueAfterResolving = promises
        this.loop.mustEnd(promises)
    }
    retry() {
        this.markForRetry = true
    }
    trueRetry() {
        this.loop.retry(this.id)
    }
    next() {
        if(this.loop._gate==0) {
            this.loop.next(this.id)
        } else {
            this.loop.gate(()=>{
                this.loop.next(this.id)
            })
        }
    } 
    rejectedPromiseHandling() {
            if(this.markForRetry) {
                this.good = false
                this.trueRetry()
            } else {
                this.good = true
                this.next()
            }
    }
    get _then() {
        return {
            resolved: (passed)=>{
                this.__then.resolved(passed, this.__args, this)
                this.hasArgs = false
                this.good = true
                this.markForRetry = false
                if(this._continueAfterResolving.length>0) {
                    Promise.all(this._continueAfterResolving).then((resolved)=>{
                        this.next()
                    })
                } else this.next()

            },
            rejected: (passed)=>{
                this.__then.rejected(passed, this.__args, ()=>{
                    this.retry()
                }, this)
                if(this._continueAfterResolving.length>0) {
                    Promise.all(this._continueAfterResolving).then((resolved)=>{
                        this.rejectedPromiseHandling()
                    })
                } else this.rejectedPromiseHandling()
            }
        }
    }
    makeWorkReal() {
            if(!this.hasArgs) this.makeArgs()
            this.loop.tickNow()
            this.good = false
            this._work(this.__args,this.loop.data,  this)
            .then(
                this._then.resolved,
                this._then.rejected
            )
    }
    makeWork() {
        if(this.loop.finished) {
            return
        }
        if(!this.loop._until(this.loop.data)){
            this.makeWorkReal()
        } else {
            if(this.markForRetry) {
                this.makeWorkReal()
            } else {
                this.loop.makeEndHappenAlmost()
            }
        }
    }
}
class syncdPromise {
    constructor(parameters) {
        this.parameters = {}
        Object.assign(this.parameters, Object.assign(
           {
            infoInterval:      10,
            parallel:           1,
            timeFrame:          null,
            limitInTimeFrame:   null,
        }, parameters))
        this.data = {
            _loop: this
        }
        this._then = (loop)=>{
            return {
                resolved: (data, args, loop)=>{
                    console.info(`[ > ] Promise resolved in syncdPromise:`, data, args)
                },
                rejected: (data, args, loop)=>{
                    console.error(`: > : Promise rejected in syncdPromise:`, data , args)
                } 
            }
        }
        this._overToPromises = 0
        this._intervals = 0
        this._unpause = []
        this._over = false
        this._mustEnd = []
        this._gated = []
        this._gate = 0
        this.paused = false
        this._paused = []
        this._i = 0
        this._limitInterval = null
    }
    start(parameters) {
        Object.assign(this.data, parameters)
        this.init()
    }
    pause() {
        this.paused = true
    }
    resume() {
        this.paused = false

        let toUnpause
        while(toUnpause = this._paused.shift()) {
            toUnpause()
        }

    }
    gate(fn) {
        this._gated.push(fn)
    }
    updateLimit() {
        this.updateLimitWith(this)
    }
    main(work) {
        this._toLimit = 0
        this._work = work
        return this
    }
    args(args) {
        this._args = args
        return this
    }
    then(then) {
        this._then = then
        return this
    }
    info(tick) {
        this._tick = tick 
        return this
    }
    tickNow() {
        if(typeof this._tick === 'function' && this._i%this.parameters.infoInterval===0) {
            this._tick(this.data, this)
        }
    }
    finish(finish) {
        this._finish = finish
        return this
    }
    until(until) {
        this._until = (x)=> {
            let r=until(x)
            this.__until = r
            return r
        }
        return this
    }
    init() {
        this.parallelWorkers = []
        for(let i = 0; i < this.parameters.parallel; i++) {
            this.parallelWorkers[i] = this.workerInit(i)
        }
        this.rateLimitStartedAt = Date.now()
        if(this.parameters.timeFrame!==null) {

            this._limitInterval = setInterval(()=>{
                this._toLimit = 0
                this.unpause()
            }, this.parameters.timeFrame)
        } else {

        }
        this.loopTrought()
        return this
    }
    get rateLimitReached() {
        this._i++
        this.tickNow()
        if(this.parameters.limitInTimeFrame!==null) this._toLimit++
        else return false
        if(this._toLimit >= this.parameters.limitInTimeFrame) {
            return true
        } else {
            return false
        }
    }
    mustEnd(promises) {
        this._overToPromises++
        Promise.all(promises)
            .then(()=>{
                this._overToPromises--
                if(!this.paused&&!this.__until) this.makeEndHappenAlmost()
            })
    }
    continueAfterResolving(promises) {
        if(promises !== null) {
            promises = promises.filter((x)=>{
                return x!==null
            })
            this._gate++
            Promise.all(promises).then(()=>{
                this._gate--
                if(this._gate<this._gated.length) {
                    let fn = this._gated.shift()
                    if(typeof fn == 'function') fn()
                }
            })
        }
    }
    over() {
        if(this.parallelWorkers.reduce(
            (a, r)=>{
                return r.good && a
            },
            true
            )) {
                return true
            }
        else return false
    }
    makeEndHappenAlmost() {
        if(!this.finished) this.makeEndHappen()
    }
    makeEndHappen() {
        if(this.over()&&this._overToPromises===0) {
            if(this.over()) {
                    this._finish(this.data)
                    if(this._limitInterval!=null) clearInterval(this._limitInterval)
                    this.finished = true
                }
            } else {
            }
    }
    unpause() {
        let toUnpause
        while(toUnpause = this._unpause.shift()) {
            toUnpause()
        }
    }
    _next(i) {
            this.parallelWorkers[i].setArgs(
                this._args
            ).makeWork()
    }
    next(i) {
        if(!this.paused) {
            if(!this.rateLimitReached) {
                    this._next(i)
            } else if(this.rateLimitReached){
                    this._unpause.push(()=>{
                        this._next(i)
                    })
            }
        } else {
            this._paused.push(()=>{
                this._next(i)
            })
        }
    }
    _retry(i) {
            this.parallelWorkers[i].makeWork()
    }
    retry(i) {
        if(!this.rateLimitReached) {
            this._retry(i)
            this.good = true
        } else if(this.rateLimitReached){
            this._unpause.push(()=>{
                this._retry(i)
            })
        }
    }
    updateLimit(updatingFunction, howOften = this.parameters.updateEvery) {
        this._updateLimit = updatingFunction
        this.parameters.updateEvery = howOften
    }
    workerInit(i) {
        return new syncdPromiseWorker(
            this,
            i,
            this._work,
            this._then(this.data)
            )
    }
    loopTrought() {
        this.parallelWorkers.forEach((x)=>{
            x.next()
        })
    }
}

module.exports = (x)=>{
  return new syncdPromise(x)
}
