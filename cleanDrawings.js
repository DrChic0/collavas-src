const fs = require('fs');
const data = JSON.parse(fs.readFileSync("drawings.json", 'utf-8'));
var count = 0;

let filteredData = [];
for (const entry of data) {
    if (entry[0].color !== "#faf700") {
        filteredData.push(entry);
		console.log(entry[0].color);
    } else {
		count++;
	}
}

fs.writeFileSync("drawings.json", JSON.stringify(filteredData), 'utf-8');
console.log("Done found " + count);