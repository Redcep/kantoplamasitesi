var visitors = [];
var searchValue = "";
var filterSchoolValue = "";
function capitalizeFirstLetters(input){
    var return_value = "";
    const words = input.split(" ");
    for(const i in words){
	var temp = words[i].charAt(0).toLocaleUpperCase("tr-TR") + words[i].slice(1) + " ";
	return_value = return_value + temp;
    }
    return_value = return_value.slice(0, -1);
    return return_value
}

function downloadString(text, fileType, fileName) {
  var blob = new Blob([text], { type: fileType });

  var a = document.createElement('a');
  a.download = fileName;
  a.href = URL.createObjectURL(blob);
  a.dataset.downloadurl = [fileType, a.download, a.href].join(':');
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(a.href); }, 1500);
}

function navButtonOnClick(){
    $(".nav button").each(function(){
	$(this).removeClass("active");
    })
    $(".page").each(function(){
	$(this).removeClass("active");
    });
    $(this).addClass("active");
    $("#" + $(this).data("page")).addClass("active");
    update();
}
function entryFormSubmit(){
    const data = {
	"name" : $("#name").val().toLocaleLowerCase("tr-TR"),
	"school" : $("#school").val().toLocaleLowerCase("tr-TR"),
	"referrer" : $("#referrer").val().toLocaleLowerCase("tr-TR"),
	"class" : $("#class").val(),
	"status" : $("#status").val(),
	"note" : $("#note").val()
    };
    $.post("record_visitor.php", data)
	.done(function(){
	    update();
	    $("#name").val("");
	    $("#referrer").val("");
	    $("#class").val("");
	    $("#status").val("waiting");
	    $("#note").val("");
	}
	     );

}
function getVisitors(){
    /*
    $.getJSON("get_visitors.php", function(data){
	visitors = data;
    }    
    );
    */
    $.ajax({dataType: "json", url: "get_visitors.php", cache: false})
	.done(function(data){
	    visitors = data;
	    renderVisitors(visitors);
	});
}
function renderVisitors(data){
    $("#recordList").empty();
    $("#recent").empty();
    for(const i in data){
	if(searchValue === ""){
	    
	}
	else if(
	    data[i].name.search(searchValue) == -1
		&& data[i].school.search(searchValue) == -1
		&& data[i].referrer.search(searchValue) == -1
	){
	    continue;
	}
	if(filterSchoolValue == ""){

	}
	else if(data[i].school.search(filterSchoolValue) == -1){
	    continue;
	}
	var temp = $("#templates").find(".entry.recordEntry").clone();
	temp.find(".entryName").text(capitalizeFirstLetters(data[i].name));
	temp.find(".entryMisc").text("Okulu/Kurumu: " + capitalizeFirstLetters(data[i].school) + " * Yönlendiren: " + capitalizeFirstLetters(data[i].referrer) + " * Sınıfı: " + data[i].class);
	var badge = temp.find(".badge");
	badge.removeClass("waiting");
	badge.removeClass("success");
	badge.removeClass("failure");
	badge.addClass(data[i].status);
	if(data[i].status == "waiting"){
	    badge.text("Beklemede");
	}
	else if(data[i].status == "failure"){
	    badge.text("Bağış gerçekleşmedi");
	}
	else if(data[i].status == "success"){
	    badge.text("Bağış tamamlandı");
	}
	temp.find(".entryStatus").val(data[i].status);
	temp.find(".entryNote").text(data[i].note);
	temp.find(".entryDelete").data("id", data[i].id);
	temp.find(".entryDelete").click(entryOnDelete);
	temp.find(".entryStatus").data("id", data[i].id);
	temp.find(".entryStatus").change(entryOnStatusChange);
	temp.show();
	$("#recordList").append(temp);
	if(i < 5){
	    var temp2 = temp.clone(true);
	    $("#recent").append(temp2);
	}
    }
}
function search(){
    searchValue = $(this).val().toLocaleLowerCase("tr-TR");
    renderVisitors(visitors);
}
function updateFilterSchool(){
    $.getJSON("get_unique_schools.php", function(data){
	$("#filterSchool").empty();
	$("#filterSchool").append($("<option>", {value: "", text: "Tüm Okullar"}));
	$("#inSchoolSelect").empty();
	$("#inSchoolSelect").append($("<option>", {value: "", text: "Okul Seçiniz"}));
	$("#inClassRankingSchoolSelect").empty();
	$("#inClassRankingSchoolSelect").append($("<option>", {value: "", text: "Okul Seçiniz"}));
	$("#betweenClassRankingSchoolSelect").empty();
	$("#betweenClassRankingSchoolSelect").append($("<option>", {value: "", text: "Okul Seçiniz"}));
	for(const i in data){
	    const option = $("<option>", {value: data[i], text: capitalizeFirstLetters(data[i])});
	    $("#filterSchool").append(option.clone());
	    $("#inSchoolSelect").append(option.clone());
	    $("#inClassRankingSchoolSelect").append(option.clone());
	    $("#betweenClassRankingSchoolSelect").append(option.clone());
	}
    }
	     );
}
function schoolFilterOnSelect(){
    filterSchoolValue = $(this).val();
    renderVisitors(visitors);
}
function updateVisitors(){
    getVisitors();
    //renderVisitors(visitors);
}
function updateDashboardStats(){
    $.getJSON("dashboard_stats.php", function(data){
	$("#total").text(data["visitor_count"]);
	$("#done").text(data["success_count"]);
	$("#wait").text(data["waiting_count"]);
	$("#schools").text(data["school_count"]);
    }
	 );
}
function update(){
    updateDashboardStats();
    updateFilterSchool();
    updateVisitors();
    updateStudentsRankings();
    updateSchoolsRankings();
}
function entryOnDelete(){
    const data = {"id" : $(this).data("id")};
    $.post("delete_visitor.php", data)
	.done(function(){update();});
}
function entryOnStatusChange(){
    if($(this).val() == ""){
	return;
    }
    const data = {
	"id" : $(this).data("id"),
	"status" : $(this).val()
    };
    $.post("update_visitor_status.php", data)
	.done(function(){update();});
}
function updateStudentsRankings(){
    $.getJSON("get_students_rankings.php", function(data){
	const top_success_count = data[0].success_count;
	$("#rankingList").empty();
	for(const i in data){
	    var temp = $("#templates").find(".rankEntry").clone();
	    temp.find(".medal").text((Number(i) + 1));
	    temp.find(".entryName").text(capitalizeFirstLetters(data[i].referrer));
	    temp.find(".entryMisc").text("Toplam kişi: " + data[i].count);
	    temp.find(".entryBar").css("width", ((data[i].success_count / top_success_count) * 100) + "%");
	    temp.find(".entryCount").text(data[i].success_count);
	    temp.show();
	    $("#rankingList").append(temp);
	}
    }
	     );

}
function updateSchoolsRankings(){
    $.getJSON("get_schools_rankings.php", function(data){
	const top_success_count = data[0].success_count;
	$("#schoolRankingList").empty();
	for(const i in data){
	    var temp = $("#templates").find(".rankEntry").clone();
	    temp.find(".medal").text((Number(i) + 1));
	    temp.find(".entryName").text(capitalizeFirstLetters(data[i].school));
	    temp.find(".entryMisc").text("Toplam kişi: " + data[i].count);
	    temp.find(".entryBar").css("width", ((data[i].success_count / top_success_count) * 100) + "%");
	    temp.find(".entryCount").text(data[i].success_count);
	    temp.show();
	    $("#schoolRankingList").append(temp);
	}
    }
	     );
}
function updateInSchoolRanking(){
    if($(this).val() == ""){
	return;
    }
    const sending_data = {
	"school" : $(this).val()
    };
    $.ajax(
	{
	    url: "get_in_school_ranking.php",
	    type: "POST",
	    dataType: "json",
	    data: sending_data
	}
    )
	.done(function(data){
	    const top_success_count = data[0].success_count;
	    $("#inSchoolRankingList").empty();
	    for(const i in data){
		var temp = $("#templates").find(".rankEntry").clone();
		temp.find(".medal").text((Number(i) + 1));
		temp.find(".entryName").text(capitalizeFirstLetters(data[i].referrer));
		temp.find(".entryMisc").text("Toplam kişi: " + data[i].count);
		temp.find(".entryBar").css("width", ((data[i].success_count / top_success_count) * 100) + "%");
		temp.find(".entryCount").text(data[i].success_count);
		temp.show();
		$("#inSchoolRankingList").append(temp);
	    }
	})
    ;
}
function updateClassesOfSchool(){
    if($(this).val() == ""){
	return;
    }
    const sending_data = {
	"school" : $(this).val()
    };
    $.ajax(
	{
	    url: "get_classes_of_school.php",
	    type: "POST",
	    dataType: "json",
	    data: sending_data
	}
    )
	.done(function(data){
	    $("#inClassRankingClassSelect").empty();
	    $("#inClassRankingClassSelect").append($("<option>", {value: "", text: "Sınıf Seçiniz"}));
	    for(const i in data){
		$("#inClassRankingClassSelect").append($("<option>", {value: data[i], text: data[i]}));
	    }
	})
    ;
}
function updateInClassRanking(){
    if( $("#inClassRankingSchoolSelect").val() == "" || $("#inClassRankingClassSelect").val() == ""){
	return;
    }
    const sending_data = {
	"school" : $("#inClassRankingSchoolSelect").val(),
	"class" : $("#inClassRankingClassSelect").val()
    };
    $.ajax(
	{
	    url: "get_in_school_ranking.php",
	    type: "POST",
	    dataType: "json",
	    data: sending_data
	}
    )
	.done(function(data){
	    const top_success_count = data[0].success_count;
	    $("#inClassRankingList").empty();
	    for(const i in data){
		var temp = $("#templates").find(".rankEntry").clone();
		temp.find(".medal").text((Number(i) + 1));
		temp.find(".entryName").text(capitalizeFirstLetters(data[i].referrer));
		temp.find(".entryMisc").text("Toplam kişi: " + data[i].count);
		temp.find(".entryBar").css("width", ((data[i].success_count / top_success_count) * 100) + "%");
		temp.find(".entryCount").text(data[i].success_count);
		temp.show();
		$("#inClassRankingList").append(temp);
	    }
	})
    ;
}
function updateBetweenClassRanking(){
    if( $("#betweenClassRankingSchoolSelect").val() == ""){
	return;
    }
    const sending_data = {
	"school" : $("#betweenClassRankingSchoolSelect").val()
    };
    $.ajax(
	{
	    url: "get_between_class_ranking.php",
	    type: "POST",
	    dataType: "json",
	    data: sending_data
	}
    )
	.done(function(data){
	    console.log(data);
	    const top_success_count = data[0].success_count;
	    $("#betweenClassRankingList").empty();
	    for(const i in data){
		var temp = $("#templates").find(".rankEntry").clone();
		temp.find(".medal").text((Number(i) + 1));
		temp.find(".entryName").text(data[i].class);
		temp.find(".entryMisc").text("Toplam kişi: " + data[i].count);
		temp.find(".entryBar").css("width", ((data[i].success_count / top_success_count) * 100) + "%");
		temp.find(".entryCount").text(data[i].success_count);
		temp.show();
		$("#betweenClassRankingList").append(temp);
	    }
	})
    ;
}
function exportOnClick(){
    $.get("csv.php", function(data){
	downloadString(data, "text/csv", "kayıtlar.csv");
    });
}
$(".nav button").click(navButtonOnClick);
$("#entryFormSubmit").click(entryFormSubmit);
$("#search").change(search);
$("#filterSchool").on("change", schoolFilterOnSelect);
$("#inSchoolSelect").change(updateInSchoolRanking);
$("#inClassRankingSchoolSelect").change(updateClassesOfSchool);
$("#inClassRankingClassSelect").change(updateInClassRanking);
$("#betweenClassRankingSchoolSelect").change(updateBetweenClassRanking);
$("#export").click(exportOnClick);
update();
