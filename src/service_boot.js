if (typeof window === "undefined") {
	// we're in a  SharedWorker
	onconnect = function (e) {
		TentContactsService.receiveConnection(e);
	};
} else {
	// we're in an iframe
	TentContactsService.run();
}
