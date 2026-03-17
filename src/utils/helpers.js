function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function addDaysToDate(currentEndDate, daysToAdd) {
    const baseDate = currentEndDate ? new Date(currentEndDate) : new Date();
    
    if (currentEndDate && new Date(currentEndDate) < new Date()) {
        return addDays(new Date(), daysToAdd);
    }
    
    const result = new Date(baseDate);
    result.setDate(result.getDate() + daysToAdd);
    return result;
}

module.exports = { addDays };