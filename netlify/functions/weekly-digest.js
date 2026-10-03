// Lifecycle emails now have a single owner: welcome-emails. Keep this scheduled
// endpoint as an explicit no-op so old schedule configuration cannot send a second digest.
exports.handler=async()=>({statusCode:200,body:JSON.stringify({mode:'retired',replacement:'welcome-emails lifecycle routing'})});
exports.config={schedule:'0 15 * * *'};
