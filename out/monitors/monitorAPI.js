// 调用 proxyXmlHttp 即可完成全局监听 XMLHttpRequest
export const proxyXmlHttp = (sendHandler, loadHandler) => {
    if ('XMLHttpRequest' in window &&
        typeof window.XMLHttpRequest === 'function') {
        const oXMLHttpRequest = window.XMLHttpRequest;
        if (!window.oXMLHttpRequest) {
            // oXMLHttpRequest 为原生的 XMLHttpRequest，可以用以 SDK 进行数据上报，区分业务
            window.oXMLHttpRequest = oXMLHttpRequest;
        }
        const { open, send } = window.XMLHttpRequest.prototype;
        let metrics = {};
        window.XMLHttpRequest.prototype.open = function pyopen(method, url, ...rest) {
            // js 中func定义的函数的this是调用方的, ()=> 是内部的定义的时候会绑定
            metrics.url = url;
            metrics.method = method;
            return open.call(this, method, url, rest[0], rest[1], rest[2]);
        };
        window.XMLHttpRequest.prototype.send = function pysend(body) {
            metrics.body = body || '';
            metrics.requestTime = new Date().getTime();
            this.addEventListener('loadend', () => {
                const { status, statusText, response } = this;
                metrics = Object.assign(Object.assign({}, metrics), { status,
                    statusText,
                    response, responseTime: new Date().getTime() });
                if (typeof loadHandler === 'function')
                    loadHandler(metrics);
                // xhr.status 状态码
            });
            // sendHandler 可以在发送 Ajax 请求之前，挂载一些信息，比如 header 请求头
            // setRequestHeader 设置请求header，用来传输关键参数等
            // xhr.setRequestHeader('xxx-id', 'VQVE-QEBQ');
            if (typeof sendHandler === 'function')
                sendHandler(body);
            return send.call(this, ...arguments);
        };
    }
};
// 调用 proxyFetch 即可完成全局监听 fetch
export const proxyFetch = (sendHandler, loadHandler) => {
    if ('fetch' in window && typeof window.fetch === 'function') {
        const oFetch = window.fetch;
        if (!window.oFetch) {
            window.oFetch = oFetch;
        }
        window.fetch = async (input, init) => {
            // init 是用户手动传入的 fetch 请求互数据，包括了 method、body、headers，要做统一拦截数据修改，直接改init即可
            if (typeof sendHandler === 'function')
                sendHandler(init);
            let metrics = {};
            metrics.method = (init === null || init === void 0 ? void 0 : init.method) || '';
            metrics.url =
                (input && typeof input !== 'string' ? input === null || input === void 0 ? void 0 : input.url : input) || ''; // 请求的url
            metrics.body = (init === null || init === void 0 ? void 0 : init.body) || '';
            metrics.requestTime = new Date().getTime();
            return oFetch.call(window, input, init).then(async (response) => {
                // clone 出一个新的 response,再用其做.text(),避免 body stream already read 问题
                const res = response.clone();
                metrics = Object.assign(Object.assign({}, metrics), { status: res.status, statusText: res.statusText, response: await res.text(), responseTime: new Date().getTime() });
                if (typeof loadHandler === 'function')
                    loadHandler(metrics);
                return response;
            });
        };
    }
};
export const monitorAPI = (client, option) => {
    const { url = client.opt.url } = option;
    // sendhander ；用于在请求前加上信息
    const loadHandler = (metrics) => {
        if (metrics.status < 400) {
            // 对于正常请求的 HTTP 请求来说,不需要记录 请求体 和 响应体
            delete metrics.response;
            delete metrics.body;
        }
        // 正常得用户请求也得上报
        client.send(url, metrics);
        //记录到用户行为记录栈
        client.breadcrumbs.push(metrics);
    };
    return {
        beforeInit: () => {
            proxyFetch(null, loadHandler);
            proxyXmlHttp(null, loadHandler);
        },
    };
};