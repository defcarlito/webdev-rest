import * as path from "node:path"
import * as url from "node:url"

import { default as express } from "express"
import { default as sqlite3 } from "sqlite3"

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const db_filename = path.join(__dirname, "db", "stpaul_crime.sqlite3")

const port = 8000

let app = express()
app.use(express.json())

/********************************************************************
 ***   DATABASE FUNCTIONS                                         ***
 ********************************************************************/
// Open SQLite3 database (in read-write mode)
let db = new sqlite3.Database(db_filename, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.log("Error opening " + path.basename(db_filename))
  } else {
    console.log("Now connected to " + path.basename(db_filename))
  }
})

// Create Promise for SQLite3 database SELECT query
function dbSelect(query, params) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err)
      } else {
        resolve(rows)
      }
    })
  })
}

// Create Promise for SQLite3 database INSERT or DELETE query
function dbRun(query, params) {
  return new Promise((resolve, reject) => {
    db.run(query, params, (err) => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

/********************************************************************
 ***   REST REQUEST HANDLERS                                      ***
 ********************************************************************/
// GET request handler for crime codes - Angelika
app.get("/codes", (req, res) => {
  console.log(req.query) // query object (key-value pairs after the ? in the url)

  res.status(200).type("json").send({}) // <-- you will need to change this
})

// GET request handler for neighborhoods - Sam
app.get("/neighborhoods", (req, res) => {
  console.log(req.query) // query object (key-value pairs after the ? in the url)
  const id = req.query.id

  let where = ""
  let qParams = []

  if (id) {
    const ids = id.split(",")
    const ph = ids.map(() => "?").join(",")
    where = `WHERE neighborhood_number IN (${ph})`
    qParams.push(...id.split(","))
  }

  const q = `
    SELECT neighborhood_number, neighborhood_name
    FROM Neighborhoods
    ${where}
    ORDER BY neighborhood_number
    `

  let finalData = []
  const rows = dbSelect(q, qParams)
  rows
    .then((data) => {
      data.forEach((neighborhood) => {
        finalData.push({
          id: neighborhood.neighborhood_number,
          name: neighborhood.neighborhood_name,
        })
      })
    })
    .then(() => {
      res.status(200).type("json").send(finalData)
    })
    .catch((error) => {
      res.status(400).type("txt").send(`Error: ${error}`)
    })
})

// GET request handler for crime incidents - Harrison
app.get("/incidents", (req, res) => {
  console.log(req.query) // query object (key-value pairs after the ? in the url)
  const startDate = req.query.start_date
  const endDate = req.query.end_date
  const code = req.query.code
  const grid = req.query.grid
  const neighborhood = req.query.neighborhood
  const limit = req.query.limit

  let whereConditions = []
  let qParams = []

  if (startDate) {
    whereConditions.push("DATE(date_time) >= DATE(?)")
    qParams.push(startDate)
  }

  if (endDate) {
    whereConditions.push("DATE(date_time) <= DATE(?)")
    qParams.push(endDate)
  }

  if (code) {
    const codes = code.split(",")
    const ph = codes.map(() => "?").join(",")
    whereConditions.push(`code IN (${ph})`)
    qParams.push(...code.split(","))
  }

  if (grid) {
    const grids = grid.split(",")
    const ph = grids.map(() => "?").join(",")
    whereConditions.push(`police_grid IN (${ph})`)
    qParams.push(...grid.split(","))
  }

  if (neighborhood) {
    const neighborhoods = neighborhood.split(",")
    const ph = neighborhoods.map(() => "?").join(",")
    whereConditions.push(`neighborhood_number IN (${ph})`)
    qParams.push(...neighborhood.split(","))
  }

  let where = ""
  if (whereConditions.length > 0) {
    where = "WHERE " + whereConditions.join(" AND ")
  }

  const lim = limit ? limit : 9999

  const q = `
    SELECT *
    FROM Incidents
    ${where}
    ORDER BY date_time DESC
    LIMIT ${lim}
    `

  let finalData = []
  const rows = dbSelect(q, qParams)
  rows
    .then((data) => {
      data.forEach((incident) => {
        const date = incident.date_time.split("T")[0]
        const time = incident.date_time.split("T")[1]

        finalData.push({
          case_number: incident.case_number,
          date: date,
          time: time,
          code: incident.code,
          incident: incident.incident,
          police_grid: incident.police_grid,
          neighborhood_number: incident.neighborhood_number,
          block: incident.block,
        })
      })
    })
    .then(() => {
      res.status(200).type("json").send(finalData) // <-- you will need to change this
    })
    .catch((error) => {
      res.status(400).type("txt").send(`Error: ${error}`)
    })
})

// PUT request handler for new crime incident - Sam
app.put("/new-incident", (req, res) => {
  console.log(req.body) // uploaded data
  
  const { case_number, date, time, code, incident, police_grid, neighborhood_number, block } = req.body

  // Validate required fields
  if (!case_number || !date || !time || !code || !incident || !police_grid || !neighborhood_number || !block) {
    return res.status(400).type("txt").send("Error: Missing required fields")
  }

  // Combine date and time into datetime format
  const date_time = `${date}T${time}`

  // Check if already exists
  const checkQuery = "SELECT case_number FROM Incidents WHERE case_number = ?"
  dbSelect(checkQuery, [case_number])
    .then((data) => {
      if (data.length > 0) {
        return Promise.reject("Case number already exists.")
      }
    })
    // Insert new 
    .then(() => {
      const insertQuery = `
        INSERT INTO Incidents (case_number, date_time, code, incident, police_grid, neighborhood_number, block)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      return dbRun(insertQuery, [case_number, date_time, code, incident, police_grid, neighborhood_number, block])
    })
    .then(() => {
      res.status(200).type("txt").send("Successfully added new incident")
    })
    .catch((error) => {
      res.status(500).type("txt").send(`Error: ${error}`)
    })
})

// DELETE request handler for new crime incident - Harrison
app.delete("/remove-incident", (req, res) => {
  console.log(req.body) // uploaded data
  const caseNumber = req.body.case_number

  const sq = "SELECT * FROM Incidents WHERE case_number == ?"
  dbSelect(sq, [caseNumber])
    // Check if row is in db first
    .then((data) => {
      if (data.length == 0) {
        return Promise.reject("Case number does not exist.")
      }
    })
    // Then delete it
    .then(() => {
      const dq = "DELETE FROM Incidents WHERE case_number == ?"
      dbRun(dq, [caseNumber]).then(() => {
        res.status(200).type("txt").send("Successfully deleted row.") // <-- you may need to change this
      })
    }).catch((error) => {
      res.status(500).type("txt").send(`Error: ${error}`)
    })
})

/********************************************************************
 ***   START SERVER                                               ***
 ********************************************************************/
// Start server - listen for client connections
app.listen(port, () => {
  console.log("Now listening on port " + port)
})
