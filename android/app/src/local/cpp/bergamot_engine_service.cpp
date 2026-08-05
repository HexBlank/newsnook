/**
 * Bergamot 真实实现（需 HAS_BERGAMOT）。
 * API 对齐 browsermt/bergamot-translator 的 Service / Response。
 */
#include "bergamot_engine.h"

#include <memory>
#include <mutex>
#include <future>
#include <stdexcept>
#include <unordered_map>

#include "translator/parser.h"
#include "translator/translation_model.h"
#include "translator/service.h"
#include "translator/response.h"
#include "translator/response_options.h"

namespace bergamot_engine {
namespace {

using Service = marian::bergamot::AsyncService;
using Model = marian::Ptr<marian::bergamot::TranslationModel>;
using Response = marian::bergamot::Response;
using ResponseOptions = marian::bergamot::ResponseOptions;

struct LoadedPair {
    explicit LoadedPair(const Service::Config& config) : service(config) {}

    Service service;
    Model model;
};

std::mutex g_mutex;
std::unordered_map<std::string, std::shared_ptr<LoadedPair>> g_services;

std::shared_ptr<LoadedPair> require_service(const std::string& pair_key) {
    auto it = g_services.find(pair_key);
    if (it == g_services.end() || !it->second) {
        throw std::runtime_error("MODEL_NOT_LOADED：请先加载 Bergamot 语对模型");
    }
    return it->second;
}

}  // namespace

bool engine_ready() {
    return true;
}

const char* engine_error() {
    return "";
}

int load(const std::string& pair_key, const std::string& config_yaml) {
    std::lock_guard<std::mutex> lock(g_mutex);
    if (g_services.count(pair_key) && g_services[pair_key]) return 0;
    try {
        marian::setThrowExceptionOnAbort(true);
        Service::Config service_config;
        service_config.numWorkers = 1;
        service_config.cacheSize = 0;
        service_config.logger.level = "off";

        auto loaded = std::make_shared<LoadedPair>(service_config);
        auto options = marian::bergamot::parseOptionsFromString(config_yaml);
        loaded->model = loaded->service.createCompatibleModel(options);
        g_services[pair_key] = loaded;
        return 0;
    } catch (const std::exception&) {
        return 2;
    } catch (...) {
        return 3;
    }
}

void unload(const std::string& pair_key) {
    std::lock_guard<std::mutex> lock(g_mutex);
    g_services.erase(pair_key);
}

void unload_all() {
    std::lock_guard<std::mutex> lock(g_mutex);
    g_services.clear();
}

std::vector<std::string> translate(
    const std::string& pair_key,
    const std::vector<std::string>& texts
) {
    std::shared_ptr<LoadedPair> loaded;
    {
        std::lock_guard<std::mutex> lock(g_mutex);
        loaded = require_service(pair_key);
    }

    ResponseOptions response_options;
    response_options.qualityScores = false;
    response_options.alignment = false;
    response_options.HTML = false;

    std::vector<std::string> out;
    out.reserve(texts.size());
    for (const auto& text : texts) {
        std::promise<Response> promise;
        auto future = promise.get_future();
        loaded->service.translate(
            loaded->model,
            std::string(text),
            [&promise](Response&& response) mutable {
                promise.set_value(std::move(response));
            },
            response_options
        );
        Response response = future.get();
        out.push_back(response.target.text);
    }
    return out;
}

}  // namespace bergamot_engine
