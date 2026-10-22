// express is a framework for nodejs
// nodejs is a runtime environment , 
// to run javascript on local machine without browser
// , based google v8 javascript engine

import express from "express"

const app = express()
const port = 5000

//middleware to handle in coming data from post request
//request body to js object convering 
app.use(express.json({limit:"1mb"}));


app.post("/name",(req,res) => {
    const name = req.body?.name;
    console.log("Posted user name is : "+name);
    if(!name)
        res.status(400).json({error : "no name field found"});

    console.log(`\n Server Log : Your user name is : ${name}`); 
    res.send(`\n Your user name is : ${name}`)
});


app.get("/",(req,res) => {
    console.log("\n Server Log : Welcome to our online marketplace"); 
    res.send("\n Welcome to our online marketplace")
});


app.listen(port,() => {
    console.log(`Server is running smoothly on http://localhost:${port}`)
});