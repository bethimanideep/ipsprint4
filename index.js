const { connection, model } = require("./db")
const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken")
const cookie = require("cookie-parser")
const requestIp = require('request-ip');
const winston = require("winston")
const { MongoDB } = require("winston-mongodb")
const { validator } = require("./validator");

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const redis = require("redis").createClient({
    url: "redis://default:000000@redis-14593.c15.us-east-1-4.ec2.cloud.redislabs.com:14593"
})
redis.on('error', err => console.log('Redis Client Error', err));
//winston
let logger = winston.createLogger({
    transports: [
        new MongoDB({
            level: "error",
            db: "mongodb+srv://manideep:manideep@cluster0.ugp5u4z.mongodb.net/ip",
            collection: "logs"
        })
        ,
        new winston.transports.File({ filename: 'error.log', level: 'error' })
    ],
    format: winston.format.prettyPrint()
})
const app = require("express")()
app.use(require("express").json())
app.use(cookie())
app.get("/", (req, res) => {
    res.send("hi")
})
app.get("/city", validator,async (req, res) => {
    let temp = false
    let token = req.cookies.token
    let blacklist = await redis.lRange("blacklist", 0, -1)
    jwt.verify(token, "masai", (error, decode) => {
        if (error) {
            logger.error(error.message, { error })
            res.send(error)
        }
        else {
            temp = decode
        }
    })
    if ((!blacklist.includes(token))&&(temp)) {
        let { ip } = req.body
        let user = await model.findOne({ email: temp.email })
        user.searches.push(ip)
        let updateuser = await model.findOneAndUpdate({ email: user.email }, { searches: user.searches })
        let data = await redis.get(ip)
        if (data) {
            console.log("from redis");
            res.send(data)
        }
        else {
            fetch(`https://ipapi.co/${ip}/city`)
                .then(function async(response) {
                    response.text().then(txt => {
                        let fun = async (txt) => {
                            await redis.setEx(ip, 21600, txt)
                            
                        }
                        fun(txt)
                        console.log("from api");
                        res.send(txt)
                    });
                })
                .catch(function (error) {
                    logger.error(error.message, { error })
                    res.send(error)
                });
        }
    }


})
app.post("/signup", async (req, res) => {
    let { email, password } = req.body
    let user = await model.findOne({ email })
    if (user == null) {
        let hash = bcrypt.hashSync(password, 5)
        let data = {
            email,
            password: hash,
            searches: []
        }
        let user = new model(data)
        await user.save()
    } else {
        res.send("already registered")
    }
    res.send("registered successfully")
})
app.post("/login", async (req, res) => {
    let { email, password } = req.body
    let user = await model.findOne({ email })
    
    if (user) {
        bcrypt.compare(password, user.password, (error, decode) => {
            if (error) {
                logger.error(error.message, { error })
                res.send(error)
            }
            else {
                let token = jwt.sign({ email }, "masai")
                res.cookie("token", token).send("login succesful")
            }
        })
    } else {
        res.send("please register to login")
    }
})
app.get("/logout", async (req, res) => {
    let token = req.cookies.token
    console.log(token);
    await redis.rPush("blacklist", token)
    // let blacklist=await redis.lRange("blacklist",0,-1)
    // console.log(blacklist);
    res.send("logout succesful")

})
app.listen(4500, async () => {
    try {
        await connection
        await redis.connect();
        console.log("connected to db");
    } catch (error) {
        logger.error(error.message, { error })
        console.log(error);
    }
    console.log("server running");
})