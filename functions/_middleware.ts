export const onRequest: PagesFunction = async context => {
	const { request } = context;
	if (request.method !== "POST") {
		return new Response("Method Not Allowed", { status: 405 });
	}
	return await context.next();
};
