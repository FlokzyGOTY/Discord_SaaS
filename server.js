const express = require("express")
const session = require("express-session")
const MongoStore = require("connect-mongo")
const mongoose = require("mongoose")
const path = require("path")
const dotenv = require("dotenv")
const methodOverride = require('method-override')

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/discord-saas", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})

// Middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(methodOverride('_method'))
app.use(express.static("public"))
app.use('/uploads', express.static(__dirname + '/uploads'));
app.use('/uploads/files', require('express').static(__dirname + '/uploads/files'));
app.set("view engine", "ejs")
app.set("views", path.join(__dirname, "views"))

// Session Configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI || "mongodb://localhost:27017/discord-saas",
    }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
    },
  }),
)

// Routes
app.use("/auth", require("./routes/auth"))
app.use("/dashboard", require("./routes/dashboard"))
app.use("/api", require("./routes/api"))
app.use("/shop", require("./routes/shop"))
app.use("/payment", require("./routes/payment"))
app.use(require("./routes/resource"))

// Home Route
app.get("/", (req, res) => {
  res.render("index", { user: req.session.user })
})

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

// Start Discord Bot
require("./bot")
